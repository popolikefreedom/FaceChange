/**
 * Provides functions to get/insert data into data stores.
 **/
var utility = require('../util/utility');
var benchmarks = require('../util/benchmarks');
var config = require('../config');
var constants = require('../constants');
var queue = require('./queue');
var playerCache = require('./playerCache');
var addToQueue = queue.addToQueue;
var mQueue = queue.getQueue('mmr');
var async = require('async');
var convert64to32 = utility.convert64to32;
var moment = require('moment');
var util = require('util');
var cQueue = queue.getQueue('cache');
var pQueue = queue.getQueue('parse');
var updateCache = playerCache.updateCache;
var serialize = utility.serialize;
var deserialize = utility.deserialize;
var columnInfo = {};
var cassandraColumnInfo = {};

var cheuka_session = require("../util/cheukaSession");

function getSets(redis, cb)
{
    async.parallel(
    {
        "trackedPlayers": function(cb)
        {
            redis.get("trackedPlayers", function(err, tps)
            {
                cb(err, JSON.parse(tps || "{}"));
            });
        },
        "userPlayers": function(cb)
        {
            redis.get("userPlayers", function(err, ups)
            {
                cb(err, JSON.parse(ups || "{}"));
            });
        },
        "donators": function(cb)
        {
            redis.get("donators", function(err, ds)
            {
                cb(err, JSON.parse(ds || "{}"));
            });
        }
    }, function(err, results)
    {
        cb(err, results);
    });
}

function cleanRow(db, table, row, cb)
{
    if (columnInfo[table])
    {
        return doCleanRow(null, columnInfo[table], row, cb);
    }
    else
    {
        db(table).columnInfo().asCallback(function(err, result)
        {
            if (err)
            {
                return cb(err);
            }
            columnInfo[table] = result;
            return doCleanRow(err, columnInfo[table], row, cb);
        });
    }
}

function cleanRowCassandra(cassandra, table, row, cb)
{
    if (cassandraColumnInfo[table])
    {
        return doCleanRow(null, cassandraColumnInfo[table], row, cb);
    }
    else
    {
        cassandra.execute(`SELECT column_name FROM system_schema.columns WHERE keyspace_name = 'yasp' AND table_name = ?`, [table], function(err, result)
        {
            if (err)
            {
                return cb(err);
            }
            cassandraColumnInfo[table] = {};
            result.rows.forEach(function(r)
            {
                cassandraColumnInfo[table][r.column_name] = 1;
            });
            return doCleanRow(err, cassandraColumnInfo[table], row, cb);
        });
    }
}

function doCleanRow(err, schema, row, cb)
{
    if (err)
    {
        return cb(err);
    }
    var obj = Object.assign(
    {}, row);
    for (var key in obj)
    {
        if (!(key in schema))
        {
            delete obj[key];
        }
    }
    return cb(err, obj);
}

function upsert(db, table, row, conflict, cb)
{
    cleanRow(db, table, row, function(err, row)
    {
        if (err)
        {
            return cb(err);
        }
        var values = Object.keys(row).map(function(key)
        {
            return '?';
        });
        var update = Object.keys(row).map(function(key)
        {
            return util.format("%s=%s", key, "EXCLUDED." + key);
        });
        var query = util.format("INSERT INTO %s (%s) VALUES (%s) ON CONFLICT (%s) DO UPDATE SET %s", table, Object.keys(row).join(','), values, Object.keys(conflict).join(','), update.join(','));
        require('fs').writeFileSync('output.json', query);
        db.raw(query, Object.keys(row).map(function(key)
        {
            return row[key];
        })).asCallback(cb);
    });
}

function insertMatch(db, redis, match, options, cb)
{
    var players = match.players ? JSON.parse(JSON.stringify(match.players)) : undefined;
    //don't insert anonymous account id
    players.forEach(function(p)
    {
        if (p.account_id === constants.anonymous_account_id)
        {
            delete p.account_id;
        }
    });
    //if we have a pgroup from earlier, use it to fill out hero_ids (used after parse)
    if (players && match.pgroup)
    {
        players.forEach(function(p)
        {
            if (match.pgroup[p.player_slot])
            {
                p.hero_id = match.pgroup[p.player_slot].hero_id;
            }
        });
    }
    //build match.pgroup so after parse we can figure out the player ids for each slot (for caching update without db read)
    if (players && !match.pgroup)
    {
        match.pgroup = {};
        players.forEach(function(p, i)
        {
            match.pgroup[p.player_slot] = {
                account_id: p.account_id,
                hero_id: p.hero_id,
                player_slot: p.player_slot
            };
        });
    }
    //put ability_upgrades data in redis
    if (players && players[0] && players[0].ability_upgrades && !options.skipAbilityUpgrades)
    {
        var ability_upgrades = {};
        players.forEach(function(p)
        {
            ability_upgrades[p.player_slot] = p.ability_upgrades ? p.ability_upgrades.map(function(au)
            {
                return au.ability;
            }) : null;
        });
        redis.setex("ability_upgrades:" + match.match_id, 60 * 60 * config.ABILITY_UPGRADE_RETENTION_HOURS, JSON.stringify(ability_upgrades));
    }
    //options.type specify api, parse, or skill
    //we want to insert into matches, then insert into player_matches for each entry in players
    async.series(
    {
        "u": upsertMatch,
        "sum": saveUserMatch,
        "uc": upsertMatchCassandra,
        "upc": updatePlayerCaches,
        "cmc": clearMatchCache,
        "t": telemetry,
        "dm": decideMmr,
        "dp": decideParse,
    }, function(err, results)
    {
        return cb(err, results.dp);
    });

    function upsertMatch(cb)
    {
        if (!config.ENABLE_POSTGRES_MATCH_STORE_WRITE)
        {
            return cb();
        }
        db.transaction(function(trx)
        {
            async.series(
            {
                "m": upsertMatches,
                "pm": upsertPlayerMatch,
                "p": upsertPlayer,
                "pb": upsertPickbans,
                "tm": upsertTeamMatch
            }, exit);

            function upsertMatches(cb)
            {
                upsert(trx, 'matches', match,
                {
                   match_id: match.match_id
                }, cb);
            }

            function upsertPlayerMatch(cb)
            {
                // rxu, add teamfights ratio info into player_matches
                if (match.teamfights) {
                    match.teamfights.forEach(function(tf) {
                        players.forEach(function(p, i) {
                            var tfplayer = tf.players[p.player_slot % (128-5)];
                            tf.participate = tfplayer.deaths > 0 || tfplayer.damage > 0 || tfplayer.healing > 0;
                            if (!p.tf_participate) {
                                p.tf_participate = 0;
                            }
                            p.tf_participate += tf.participate ? 1:0;
                        });
                    });
                }


                async.each(players || [], function(pm, cb)
                {
                    // rxu, also add runes, vision info
                    if (pm.runes) {
                        pm.runes_total = 0;
                        for (var key in constants.runes) {
                            pm.runes_total += pm.runes[key] ? Number(pm.runes[key]) : 0;
                        }

                        pm.vision_bought = pm.purchase_ward_observer ? Number(pm.purchase_ward_observer) : 0
                                     + pm.purchase_ward_sentry ? Number(pm.purchase_ward_sentry) : 0;
                        pm.vision_killed = pm.observer_kills ? Number(pm.observer_kills) : 0
                         + pm.sentry_kills ? Number(pm.sentry_kills) : 0;

                        pm.purchase_dust = pm.purchase.dust ? Number(pm.purchase.dust) : 0;

                        if (pm.item_uses_arr) {
                            var power_treads = pm.item_uses_arr.filter(function(a) {
                                return a && a.name == "power_treads";
                            });
                            pm.power_treads_usetimes = power_treads.length > 0 ? power_treads[0].val : 0;
                            pm.power_treads_buytime = pm.purchase_time["power_treads"] ? pm.purchase_time["power_treads"] : 0;
                        }

                        //console.log('power treads ' + pm.power_treads_usetimes);
                        //console.log('power_treads buy time ' + pm.power_treads_buytime);
                        //console.log('apm ' + pm.actions_per_min);
                        pm.apm = pm.actions_per_min;
                    }

                    pm.match_id = match.match_id;
                    if (pm.tf_participate) {
                        pm.tf_ratio = Math.round(100 * pm.tf_participate / match.teamfights.length);
                    }

                    upsert(trx, 'player_matches', pm,
                    {
                        match_id: pm.match_id,
                        player_slot: pm.player_slot
                    }, cb);
                }, cb);
            }

            function upsertPlayer(cb)
            {
                async.each(players || [], function(p, cb)
                {
                    if (p.steamid) {
                        upsert(trx, 'player_info', p,
                        {
                            steamid: p.steamid
                        }, cb);
                    }
                    else {
                        cb();
                    }

                }, cb);
            }

            function upsertPickbans(cb)
            {
                if (match.picks_bans || match.upload && match.upload.picks_bans)
                {
                    var pbs = match.picks_bans || match.upload.picks_bans;

                    if (players && players.length == 10) //rxu, we only handle 10 players case
                    {
                        // first insert radiant player id
                        pbs.forEach(function(pb, i)
                        {
                            var is_radiant = pb.team_id === 0;
                            if (pb.is_pick && is_radiant)
                            {
                                for (var pi = 0; pi < 5; ++pi)
                                {
                                    if (pb.hero_id === players[pi].hero_id)
                                    {
                                        pb.player_id = players[pi].account_id || 0;
                                    }
                                }
                            }

                            if ( pb.order === undefined)
                            {
                                pb.order = i;
                            }

                        });

                        // then insert dire player id
                        pbs.forEach(function(pb, i)
                        {
                            var is_radiant = pb.team_id === 0;
                            if (pb.is_pick && !is_radiant)
                            {
                                for (var pi = 5; pi < 10; ++pi)
                                {
                                    if (pb.hero_id === players[pi].hero_id)
                                    {
                                        pb.player_id = players[pi].account_id || 0;
                                    }
                                }
                            }

                            if ( pb.order === undefined)
                            {
                                pb.order = i;
                            }
                        });
                    }

                    async.each(pbs || [], function (p, cb)
                    {
                        p.ord = p.order;
                        p.match_id = match.match_id;
                        upsert(trx, 'picks_bans', p,
                        {
                            match_id: p.match_id,
                            ord: p.ord
                        }, cb);
                    }, cb);
                }
                else
                {
                  return cb();
                }
           }

		   function upsertTeamMatch(cb)
		   {
                async.series(
               {
                   'r': addRadiant,
                   'd': addDire,
               }, cb);

			   function addRadiant(cb)
			   {
					var team_id = match.radiant_team_id || 0;
					var mv = match.version || 0;
					var tm;
					tm =
					{
						is_radiant: true,
						is_winner: match.radiant_win,
						end_time: match.end_time || 0,
						version: mv.toString(),
						team_id: team_id,
						match_id: match.match_id
					}
					if(team_id && match.match_id)
					{
						upsert(trx, 'team_match', tm,
						{
						   team_id: team_id,
						   match_id: match.match_id
						}, cb);
					} else
					{
						return cb();
					}
			   }

			   function addDire(cb)
				{
					var team_id = match.dire_team_id || 0;
					var mv = match.version || 0;
					var tm;
					tm =
					{
					   is_radiant: false,
					   is_winner: !match.radiant_win,
					   end_time: match.end_time || 0,
					   version: mv.toString(),
					   team_id: team_id,
					   match_id: match.match_id
					}
					if(team_id && match.match_id)
					{
						upsert(trx, 'team_match', tm,
						{
							team_id: team_id,
							match_id: match.match_id
						}, cb);
					} else
					{
						return cb();
					}
				}
           }

           function exit(err)
           {
               if (err)
               {
                   console.error(err);
                   trx.rollback(err);
               }
               else
               {
                   trx.commit();
               }
               cb(err);
            }
        });
    }

    function saveUserMatch(cb)
	{
		// lordstone: save to user_match_list
		//console.log('saving to user_match_list');
		//cheuka_session.saveMatchToUser(db, match.user_id, match.match_id, match.is_public);
		return cb();
	}

    function upsertMatchCassandra(cb)
    {
        var cassandra = options.cassandra;
        if (!cassandra)
        {
            return cb();
        }
        //console.log('[INSERTMATCH] upserting into Cassandra');
        cleanRowCassandra(cassandra, 'matches', match, function(err, match)
        {
            if (err)
            {
                return cb(err);
            }
            var obj = serialize(match);
            var query = util.format('INSERT INTO matches (%s) VALUES (%s)', Object.keys(obj).join(','), Object.keys(obj).map(function(k)
            {
                return '?';
            }).join(','));
            var arr = Object.keys(obj).map(function(k)
            {
                // boolean types need to be expressed as booleans, if strings the cassandra driver will always convert it to true, e.g. 'false'
                return k === "radiant_win" ? JSON.parse(obj[k]) : obj[k];
            });
            cassandra.execute(query, arr,
            {
                prepare: true,
            }, function(err, result)
            {
                if (err)
                {
                    return cb(err);
                }
                async.each(players || [], function(pm, cb)
                {
                    pm.match_id = match.match_id;
                    cleanRowCassandra(cassandra, 'player_matches', pm, function(err, pm)
                    {
                        if (err)
                        {
                            return cb(err);
                        }
                        var obj2 = serialize(pm);
                        var query2 = util.format('INSERT INTO player_matches (%s) VALUES (%s)', Object.keys(obj2).join(','), Object.keys(obj2).map(function(k)
                        {
                            return '?';
                        }).join(','));
                        var arr2 = Object.keys(obj2).map(function(k)
                        {
                            return obj2[k];
                        });
                        cassandra.execute(query2, arr2,
                        {
                            prepare: true
                        }, cb);
                    });
                }, cb);
            });
        });
    }

    function updatePlayerCaches(cb)
    {
        if (options.skipCacheUpdate)
        {
            return cb();
        }
        var copy = JSON.parse(JSON.stringify(match));
        copy.players = JSON.parse(JSON.stringify(players));
        copy.insert_type = options.type;
        copy.origin = options.origin;
        updateCache(copy, function(err)
        {
            if (err)
            {
                return cb(err);
            }
            //add to queue for counts
            queue.addToQueue(cQueue, copy,
            {
                attempts: 1
            }, cb);
        });
    }

    function telemetry(cb)
    {
        //console.log('[INSERTMATCH] updating telemetry');
        var types = {
            "api": 'matches_last_added',
            "parsed": 'matches_last_parsed'
        };
        if (types[options.type])
        {
            redis.lpush(types[options.type], JSON.stringify(
            {
                match_id: match.match_id,
                duration: match.duration,
                start_time: match.start_time,
            }));
            redis.ltrim(types[options.type], 0, 9);
        }
        if (options.type === "parsed")
        {
            redis.zadd("parser", moment().format('X'), match.match_id);
        }
        return cb();
    }

    function clearMatchCache(cb)
    {
       	redis.del("match:" + match.match_id, cb);
    }

    function decideMmr(cb)
    {
        async.each(match.players, function(p, cb)
        {
            if (options.origin === "scanner" && match.lobby_type === 7 && p.account_id !== constants.anonymous_account_id && (p.account_id in options.userPlayers || (config.ENABLE_RANDOM_MMR_UPDATE && match.match_id % 3 === 0)))
            {
                addToQueue(mQueue,
                {
                    match_id: match.match_id,
                    account_id: p.account_id
                },
                {
                    attempts: 1,
                    delay: 180000,
                }, cb);
            }
            else
            {
                cb();
            }
        }, cb);
    }

    function decideParse(cb)
    {
        if (match.parse_status !== 0)
        {
            //not parsing this match
            //this isn't a error, although we want to report that we refused to parse back to user if it was a request
            return cb();
        }
        else
        {
            //queue it and finish, callback with the queued parse job
            return queue.addToQueue(pQueue,
            {
                match_id: match.match_id,
                radiant_win: match.radiant_win,
                start_time: match.start_time,
                duration: match.duration,
                replay_blob_key: match.replay_blob_key,
                pgroup: match.pgroup,
                downloaded: match.downloaded
            },
            {
                lifo: options.lifo,
                attempts: options.attempts,
                backoff: options.backoff,
            }, function(err, job2)
            {
                cb(err, job2);
            });
        }
    }
}

function insertPlayer(db, player, cb)
{
    if (player.steamid)
    {
        //this is a login, compute the account_id from steamid
        player.account_id = Number(convert64to32(player.steamid));
    }
    if (!player.account_id || player.account_id === constants.anonymous_account_id)
    {
        return cb();
    }
    upsert(db, 'players', player,
    {
        account_id: player.account_id
    }, cb);
}

function insertPlayerRating(db, row, cb)
{
    db('player_ratings').insert(row).asCallback(cb);
}

function insertMatchSkill(db, row, cb)
{
    upsert(db, 'match_skill', row,
    {
        match_id: row.match_id
    }, cb);
}

/**
 * Benchmarks a match against stored data in Redis.
 **/
function benchmarkMatch(redis, m, cb)
{
    async.map(m.players, function(p, cb)
    {
        p.benchmarks = {};
        async.eachSeries(Object.keys(benchmarks), function(metric, cb)
        {
            //in development use live data (for speed), in production use full data from last day (for consistency)
            var key = ['benchmarks', utility.getStartOfBlockHours(config.BENCHMARK_RETENTION_HOURS, config.NODE_ENV === "development" ? 0 : -1), metric, p.hero_id].join(':');
            var raw = benchmarks[metric](m, p);
            p.benchmarks[metric] = {
                raw: raw
            };
            redis.zcard(key, function(err, card)
            {
                if (err)
                {
                    return cb(err);
                }
                if (raw !== undefined && raw !== null && !Number.isNaN(raw))
                {
                    redis.zcount(key, '0', raw, function(err, count)
                    {
                        if (err)
                        {
                            return cb(err);
                        }
                        var pct = count / card;
                        p.benchmarks[metric].pct = pct;
                        return cb(err);
                    });
                }
                else
                {
                    p.benchmarks[metric] = {};
                    cb();
                }
            });
        }, cb);
    }, cb);
}

function getMatchRating(redis, match, cb)
{
    async.map(match.players, function(player, cb)
    {
        if (!player.account_id)
        {
            return cb();
        }
        redis.zscore('solo_competitive_rank', player.account_id, cb);
    }, function(err, result)
    {
        if (err)
        {
            return cb(err);
        }
        var filt = result.filter(function(r)
        {
            return r;
        });
        var avg = ~~(filt.map(function(r)
        {
            return Number(r);
        }).reduce(function(a, b)
        {
            return a + b;
        }, 0) / filt.length);
        cb(err, avg);
    });
}

function getTeamFetchedMatches(db, payload, cb)
{
    db.table('fetch_team_match').select(['fetch_team_match.*', 'league_info.league_url', 'league_info.league_name', 'matches.radiant_team_id', 'matches.dire_team_id', 'matches.radiant_win']).where({
        'team_id': payload.team_id,
        //'is_fetched': true
    }).leftJoin('league_info', 'fetch_team_match.league_id', 'league_info.league_id')
    .innerJoin('matches', 'matches.match_id', 'fetch_team_match.match_id')
    .whereNotNull('fetch_team_match.start_time')
    .where('fetch_team_match.start_time', '>', 1470009600)
    .orderByRaw('fetch_team_match.start_time desc').asCallback(function(err, result) {
        if (err) {
            console.error(err);
            return cb('query failed');
        }
        //console.log(JSON.stringify(result));
        return cb(null, result);
    });
}

function getTeamMatchInfo(db, payload, cb)
{
    // define a large time range
    var st = 0;
    var ed = 9476438230;

    if (payload.st) {
        st = payload.st;
    }

    if (payload.ed) {
        ed = payload.ed;
    }

    db.table('fetch_team_match').select(['fetch_team_match.*', 'league_info.league_url', 'league_info.league_name', 'matches.radiant_team_id', 'matches.dire_team_id', 'matches.radiant_win']).where({
        'team_id': payload.team_id,
        //'is_fetched': true
    }).leftJoin('league_info', 'fetch_team_match.league_id', 'league_info.league_id')
    .innerJoin('matches', 'matches.match_id', 'fetch_team_match.match_id')
    .whereNotNull('fetch_team_match.start_time')
    .where('fetch_team_match.start_time', '>', 1470009600)
    .where(db.raw('matches.start_time > ?', st))
    .where(db.raw('matches.start_time < ?', ed))
    .orderByRaw('fetch_team_match.start_time desc').asCallback(function(err, result) {
        if (err) {
            console.error(err);
            return cb('query failed');
        }
        //console.log(JSON.stringify(result));
        return cb(null, result);
    });
}


function getMantaParseData(db, payload, cb)
{
    // define a large time range
    var st = 0;
    var ed = 9476438230;

    if (payload.st) {
        st = payload.st;
    }

    if (payload.ed) {
        ed = payload.ed;
    }
    console.log("getMantaParseData");
    if (payload.league_id) {
        db.table('player_matches').count('* as num_played')
        .avg('hero_healing as av_healing')
		.avg('tower_damage as av_td')
        .avg('tf_ratio as tf_ratio')
        .avg('create_total_damages as av_create_total_damage')
        .avg('create_deadly_damages as av_create_deadly_damages')
        .avg('create_total_stiff_control as av_create_total_stiff_control')
        .avg('create_deadly_stiff_control as av_create_deadly_stiff_control')
        .avg('opponent_hero_deaths as av_opponent_hero_deaths')
        .avg('create_deadly_damages_per_death as av_create_deadly_damages_per_death')
        .avg('create_deadly_stiff_control_per_death as av_create_deadly_stiff_control_per_death')
        .avg('rgpm as av_rgpm')
        .avg('unrrpm as av_unrrpm')
        .avg('killherogold as av_killherogold')
        .avg('deadlosegold as av_deadlosegold')
        .avg('fedenemygold as av_fedenemygold')
        .avg('alonekillednum as av_alonekillednum')
        .avg('alonebecatchednum as av_alonebecatchednum')
        .avg('alonebekillednum as av_alonebekillednum')
        .avg('consumedamage as av_consumedamage')
        .avg('vision_bought as av_vision_bought')
        .avg('vision_killed as av_vision_kill')
        .avg('runes_total as av_runes')
        .avg('purchase_dust')
        .avg('apm as av_apm').avg('lh_t[7] as av_lh').avg('gold_t[7] as av_gold_t').avg('xp_t[7] as av_xp_t').avg('one(kills_log) as av_kill_t')
        .sum('power_treads_usetimes as sum_power_treads_usetimes')
        .select(db.raw('count (case when power_treads_buytime > 0 then 1 end) as power_treads_buytimes'))
        .select(db.raw('sum( cast(?? as float) * 60 / cast(?? - ?? as float)) as sum_pt_uspermin',["power_treads_usetimes", "duration", "power_treads_buytime"]))
        .select(db.raw('count (case when iswin then 1 end) as win_times'))
        .select(db.raw('max (coalesce(player_info.personaname, ?)) as player_name', 'anonymous'))
        .leftJoin('player_info', 'player_matches.steamid', 'player_info.steamid')
        .innerJoin('matches', 'matches.match_id', 'player_matches.match_id')
        .where('create_total_damages', '>', '0')
        .where('matches.leagueid', payload.league_id)
        .where(db.raw('matches.start_time > ?', st))
        .where(db.raw('matches.start_time < ?', ed))
        .groupBy('player_matches.account_id')
        .asCallback(function(err, result) {
            console.error(err);
            if (err) {
                return cb('query failed');
            }
            return cb(null, result);
        });
    }
    else if (payload.player_account_id) {
        db.table('player_matches')
        .max('hero_id as hero_id')
        .count('* as num_played')
        .avg('hero_healing as av_healing')
		.avg('tower_damage as av_td')
        .avg('tf_ratio as tf_ratio')
        .avg('create_total_damages as av_create_total_damage')
        .avg('create_deadly_damages as av_create_deadly_damages')
        .avg('create_total_stiff_control as av_create_total_stiff_control')
        .avg('create_deadly_stiff_control as av_create_deadly_stiff_control')
        .avg('opponent_hero_deaths as av_opponent_hero_deaths')
        .avg('create_deadly_damages_per_death as av_create_deadly_damages_per_death')
        .avg('create_deadly_stiff_control_per_death as av_create_deadly_stiff_control_per_death')
        .avg('rgpm as av_rgpm')
        .avg('unrrpm as av_unrrpm')
        .avg('killherogold as av_killherogold')
        .avg('deadlosegold as av_deadlosegold')
        .avg('fedenemygold as av_fedenemygold')
        .avg('alonekillednum as av_alonekillednum')
        .avg('alonebecatchednum as av_alonebecatchednum')
        .avg('alonebekillednum as av_alonebekillednum')
        .avg('consumedamage as av_consumedamage')
        .avg('vision_bought as av_vision_bought')
        .avg('vision_killed as av_vision_kill')
        .avg('runes_total as av_runes')
        .avg('purchase_dust')
        .avg('apm as av_apm').avg('lh_t[7] as av_lh').avg('gold_t[7] as av_gold_t').avg('xp_t[7] as av_xp_t').avg('one(kills_log) as av_kill_t')
        .select(db.raw('count (case when iswin then 1 end) as win_times'))
        .select(db.raw('max (coalesce(player_info.personaname, ?)) as player_name', 'anonymous'))
        .leftJoin('player_info', 'player_matches.steamid', 'player_info.steamid')
        .innerJoin('matches', 'matches.match_id', 'player_matches.match_id')
        .where('create_total_damages', '>', '0')
        .where('player_matches.account_id', '=', payload.player_account_id)
        .where(db.raw('matches.start_time > ?', st))
        .where(db.raw('matches.start_time < ?', ed))
        .groupBy('player_matches.hero_id')
        .asCallback(function(err, result) {
            console.error(err);
            if (err) {
                return cb('query failed');
            }
            return cb(null, result);
        });
    }
    else {
        db.table('player_matches').count('* as num_played')
        .avg('hero_healing as av_healing')
		.avg('tower_damage as av_td')
        .avg('tf_ratio as tf_ratio')
        .avg('create_total_damages as av_create_total_damage')
        .avg('create_deadly_damages as av_create_deadly_damages')
        .avg('create_total_stiff_control as av_create_total_stiff_control')
        .avg('create_deadly_stiff_control as av_create_deadly_stiff_control')
        .avg('opponent_hero_deaths as av_opponent_hero_deaths')
        .avg('create_deadly_damages_per_death as av_create_deadly_damages_per_death')
        .avg('create_deadly_stiff_control_per_death as av_create_deadly_stiff_control_per_death')
        .avg('rgpm as av_rgpm')
        .avg('unrrpm as av_unrrpm')
        .avg('killherogold as av_killherogold')
        .avg('deadlosegold as av_deadlosegold')
        .avg('fedenemygold as av_fedenemygold')
        .avg('alonekillednum as av_alonekillednum')
        .avg('alonebecatchednum as av_alonebecatchednum')
        .avg('alonebekillednum as av_alonebekillednum')
        .avg('consumedamage as av_consumedamage')
        .avg('vision_bought as av_vision_bought')
        .avg('vision_killed as av_vision_kill')
        .avg('runes_total as av_runes')
        .avg('purchase_dust')
        .avg('apm as av_apm').avg('lh_t[7] as av_lh').avg('gold_t[7] as av_gold_t').avg('xp_t[7] as av_xp_t')
        .sum('power_treads_usetimes as sum_power_treads_usetimes').select(db.raw('avg(one(kills_log)) as av_kill_t'))
        .select(db.raw('avg(cacuclate_rate(player_slot, create_deadly_damages, player_matches.match_id, player_matches.account_id, 1)) as av_rate_deadly_damage'))
        .select(db.raw('count (case when power_treads_buytime > 0 then 1 end) as power_treads_buytimes'))
        .select(db.raw('sum( cast(?? as float) * 60 / cast(?? - ?? as float)) as sum_pt_uspermin',["power_treads_usetimes", "duration", "power_treads_buytime"]))
        .select(db.raw('count (case when iswin then 1 end) as win_times'))
        .select(db.raw('max (coalesce(player_info.personaname, ?)) as player_name', 'anonymous'))
        .leftJoin('player_info', 'player_matches.steamid', 'player_info.steamid')
        .innerJoin('matches', 'matches.match_id', 'player_matches.match_id')
        .where('create_total_damages', '>', '0')
        .where(db.raw('matches.start_time > ?', st))
        .where(db.raw('matches.start_time < ?', ed))
        .groupBy('player_matches.account_id')
        .asCallback(function(err, result) {
            console.error(err);
            if (err) {
                return cb('query failed');
            }
            return cb(null, result);
        });
    }
}

function getHeroAnalysisData(db, payload, cb)
{
    // define a large time range
    var st = 0;
    var ed = 9476438230;

    if (payload.st) {
        st = payload.st;
    }

    if (payload.ed) {
        ed = payload.ed;
    }

    if (payload.hero_id) {
        db.table('player_matches')
        .select(db.raw('max (coalesce(player_info.personaname, ?)) as player_name', 'anonymous'))
        .count('* as num_played')
        .avg('hero_healing as av_healing')
		.avg('tower_damage as av_td')
        .avg('tf_ratio as tf_ratio')
        .avg('create_total_damages as av_create_total_damage')
        .avg('create_deadly_damages as av_create_deadly_damages')
        .avg('create_total_stiff_control as av_create_total_stiff_control')
        .avg('create_deadly_stiff_control as av_create_deadly_stiff_control')
        .avg('opponent_hero_deaths as av_opponent_hero_deaths')
        .avg('create_deadly_damages_per_death as av_create_deadly_damages_per_death')
        .avg('create_deadly_stiff_control_per_death as av_create_deadly_stiff_control_per_death')
        .avg('rgpm as av_rgpm')
        .avg('unrrpm as av_unrrpm')
        .avg('killherogold as av_killherogold')
        .avg('deadlosegold as av_deadlosegold')
        .avg('fedenemygold as av_fedenemygold')
        .avg('alonekillednum as av_alonekillednum')
        .avg('alonebecatchednum as av_alonebecatchednum')
        .avg('alonebekillednum as av_alonebekillednum')
        .avg('consumedamage as av_consumedamage')
        .avg('vision_bought as av_vision_bought')
        .avg('vision_killed as av_vision_kill')
        .avg('runes_total as av_runes')
        .avg('purchase_dust')
        .select(db.raw('string_agg( (case when iswin then ?? end)::text, ?) as win_id', ["matches.match_id", ";"]))
        .select(db.raw('string_agg( (case when not iswin then ?? end)::text, ?) as lose_id', ["matches.match_id", ";"]))
        //.avg('apm as av_apm')
        .select(db.raw('count (case when iswin then 1 end) as win_times'))
        .leftJoin('player_info', 'player_matches.steamid', 'player_info.steamid')
        .innerJoin('matches', 'matches.match_id', 'player_matches.match_id')
        .where('create_total_damages', '>', '0')
        .where('player_matches.hero_id', '=', payload.hero_id)
        .where(db.raw('matches.start_time > ?', st))
        .where(db.raw('matches.start_time < ?', ed))
        .groupBy('player_matches.account_id')
        .asCallback(function(err, result) {
            console.error(err);
            if (err) {
                return cb('query failed');
            }
            return cb(null, result);
        });
    }
}


function getLeagueList(db, payload, cb)
{
    db.table('fetch_team_match')
    .countDistinct('match_id as num_matches')
    .max('fetch_team_match.league_id as league_id')
    .max('league_name as league_name')
    .innerJoin('league_info', 'league_info.league_id', 'fetch_team_match.league_id')
    .where('is_fetched', true)
    .groupBy('fetch_team_match.league_id')
    .asCallback(function(err, result){
        if (err) {
            return cb(err);
        }

        return cb(null, result);
    });
}

function getTeamPlayers(db, payload, cb)
{
    var team_id = payload.team_id;
    db.table('matches')
    .select('match_id')
    .select(db.raw(' (case when radiant_team_id = ? then true else false end) as is_radiant ', team_id))
    .where(db.raw('?? = ? or ?? = ?', ["radiant_team_id", team_id, "dire_team_id", team_id]))
    .andWhere(db.raw('start_time is not null'))
    .orderBy('start_time', 'desc')
    .limit(5)
    .asCallback(function(err, result){
        if (err) {
            return cb(err);
        }

        if (result.length == 0) {
             console.error('not matched match id');
        }

        var res;
        async.eachSeries(result, function(match, next) {
            var match_id = match.match_id;
            var is_radiant = match.is_radiant;
            if (is_radiant) {
                //console.log('radiant team');
                db.table('player_matches')
                .select('account_id', 'player_matches.steamid', 'player_info.personaname as player_name')
                .leftJoin('player_info', 'player_matches.steamid', 'player_info.steamid')
                .where('match_id', match_id)
                .where('player_slot', '<', 128)
                .asCallback(function(err, result2) {
                    if (err) {
                        return next(err);
                    }

                    if (result2.length == 0) {
                        return next();
                    }
                    else {
                        res= result2;
                        return next('finished');
                    }
                });
            }
            else {
                //console.log('dire team');
                db.table('player_matches').select('account_id', 'player_matches.steamid', 'player_info.personaname as player_name')
                .leftJoin('player_info', 'player_matches.steamid', 'player_info.steamid')
                .where('match_id', match_id)
                .where('player_slot', '>', 127)
                .asCallback(function(err, result2) {
                    if (err) {
                        return next(err);
                    }

                    if (result2.length == 0) {
                        return next();
                    }
                    else {
                        res = result2;
                        return next('finished');
                    }
                });
            }
        }, function(err) {
            return cb(null, res);
        });





    });
}

function getDistributions(redis, cb)
{
    var keys = ["distribution:mmr", "distribution:country_mmr"];
    var result = {};
    async.each(keys, function(r, cb)
    {
        redis.get(r, function(err, blob)
        {
            if (err)
            {
                return cb(err);
            }
            result[r.split(':')[1]] = JSON.parse(blob);
            cb(err);
        });
    }, function(err)
    {
        return cb(err, result);
    });
}

function getPicks(redis, options, cb)
{
    var length = options.length;
    var limit = options.limit;
    var single_rates = {};
    //look up total
    redis.get('picks_match_count', function(err, total)
    {
        if (err)
        {
            return cb(err);
        }
        //get singles games/wins for composite computation
        async.parallel(
        {
            "picks": function(cb)
            {
                async.map(Object.keys(constants.heroes), function(hero_id, cb)
                {
                    redis.zscore('picks_counts:1', hero_id, cb);
                }, cb);
            },
            "wins": function(cb)
            {
                async.map(Object.keys(constants.heroes), function(hero_id, cb)
                {
                    redis.zscore('picks_wins_counts:1', hero_id, cb);
                }, cb);
            }
        }, function(err, result)
        {
            if (err)
            {
                return cb(err);
            }
            Object.keys(constants.heroes).forEach(function(hero_id, i)
            {
                single_rates[hero_id] = {
                    pick_rate: Number(result.picks[i]) / total,
                    win_rate: Number(result.wins[i]) / Number(result.picks[i])
                };
            });
            //get top 1000 picks for current length
            redis.zrevrangebyscore('picks_counts:' + length, "inf", "-inf", "WITHSCORES", "LIMIT", "0", limit, function(err, rows)
            {
                if (err)
                {
                    return cb(err);
                }
                var entries = rows.map(function(r, i)
                {
                    return {
                        key: r,
                        games: rows[i + 1]
                    };
                }).filter(function(r, i)
                {
                    return i % 2 === 0;
                });
                //look up wins
                async.each(entries, function(entry, cb)
                {
                    entry.pickrate = entry.games / total;
                    var hids = entry.key.split(',');
                    entry.expected_pick = hids.map(function(hero_id)
                    {
                        return single_rates[hero_id].pick_rate;
                    }).reduce((prev, curr) => prev * curr) / hids.length;
                    entry.expected_win = expectedWin(hids.map(function(hero_id)
                    {
                        return single_rates[hero_id].win_rate;
                    }));
                    redis.zscore('picks_wins_counts:' + length, entry.key, function(err, score)
                    {
                        if (err)
                        {
                            return cb(err);
                        }
                        entry.wins = Number(score);
                        entry.winrate = entry.wins / entry.games;
                        cb(err);
                    });
                }, function(err)
                {
                    return cb(err,
                    {
                        total: Number(total),
                        n: length,
                        entries: entries
                    });
                });
            });
        });
    });
}

function expectedWin(rates)
{
    //simple implementation, average
    //return rates.reduce((prev, curr) => prev + curr)) / hids.length;
    //advanced implementation, asymptotic
    //https://github.com/yasp-dota/yasp/issues/959
    //return 1 - rates.reduce((prev, curr) => (1 - curr) * prev, 1) / (Math.pow(50, rates.length-1));
    return 1 - rates.reduce((prev, curr) => (100 - curr * 100) * prev, 1) / (Math.pow(50, rates.length - 1) * 100);
}

function getTop(db, redis, cb)
{
    db.raw(`
    SELECT * from notable_players
    `).asCallback(function(err, result)
    {
        if (err)
        {
            return cb(err);
        }
        getLeaderboard(db, redis, 'solo_competitive_rank', 500, function(err, result2)
        {
            return cb(err,
            {
                notables: result.rows,
                leaderboard: result2
            });
        });
    });
}

function getHeroRankings(db, redis, hero_id, options, cb)
{
    getLeaderboard(db, redis, [options.beta ? 'hero_rankings2' : 'hero_rankings', moment().startOf('quarter').format('X'), hero_id].join(':'), 100, function(err, entries)
    {
        if (err)
        {
            return cb(err);
        }
        async.each(entries, function(player, cb)
        {
            async.parallel(
            {
                solo_competitive_rank: function(cb)
                {
                    redis.zscore('solo_competitive_rank', player.account_id, cb);
                },
            }, function(err, result)
            {
                if (err)
                {
                    return cb(err);
                }
                player.solo_competitive_rank = result.solo_competitive_rank;
                cb(err);
            });
        }, function(err)
        {
            return cb(err,
            {
                hero_id: Number(hero_id),
                rankings: entries
            });
        });
    });
}

function getBenchmarks(db, redis, options, cb)
{
    var hero_id = options.hero_id;
    var ret = {};
    async.each(Object.keys(benchmarks), function(metric, cb)
    {
        var arr = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 0.95, 0.99];
        async.each(arr, function(percentile, cb)
        {
            var key = ["benchmarks", utility.getStartOfBlockHours(config.BENCHMARK_RETENTION_HOURS, config.NODE_ENV === "development" ? 0 : -1), metric, hero_id].join(':');
            redis.zcard(key, function(err, card)
            {
                if (err)
                {
                    return cb(err);
                }
                var position = ~~(card * percentile);
                redis.zrange(key, position, position, "WITHSCORES", function(err, result)
                {
                    var obj = {
                        percentile: percentile,
                        value: Number(result[1])
                    };
                    if (!ret[metric])
                    {
                        ret[metric] = [];
                    }
                    ret[metric].push(obj);
                    cb(err, obj);
                });
            });
        }, cb);
    }, function(err)
    {
        return cb(err,
        {
            hero_id: Number(hero_id),
            result: ret
        });
    });
}

function getLeaderboard(db, redis, key, n, cb)
{
    redis.zrevrangebyscore(key, "inf", "-inf", "WITHSCORES", "LIMIT", "0", n, function(err, rows)
    {
        if (err)
        {
            return cb(err);
        }
        var entries = rows.map(function(r, i)
        {
            return {
                account_id: r,
                score: rows[i + 1]
            };
        }).filter(function(r, i)
        {
            return i % 2 === 0;
        });
        var account_ids = entries.map(function(r)
        {
            return r.account_id;
        });
        //get player data from DB
        db.select().from('players').whereIn('account_id', account_ids).asCallback(function(err, names)
        {
            if (err)
            {
                return cb(err);
            }
            var obj = {};
            names.forEach(function(n)
            {
                obj[n.account_id] = n;
            });
            entries.forEach(function(e)
            {
                for (var key in obj[e.account_id])
                {
                    e[key] = e[key] || obj[e.account_id][key];
                }
            });
            cb(err, entries);
        });
    });
}

function mmrEstimate(db, redis, account_id, cb)
{
    redis.lrange('mmr_estimates:' + account_id, 0, -1, function(err, result)
    {
        if (err)
        {
            return cb(err);
        }
        var data = result.filter(function(d)
        {
            //remove invalid values
            return d;
        }).map(function(d)
        {
            //convert to numerical values
            return Number(d);
        });
        cb(err,
        {
            estimate: utility.average(data),
            stdDev: utility.stdDev(data),
            n: data.length
        });
    });
}
/**
 * @param db - databse object
 * @param search - object to for where parameter of query
 * @param cb - callback
 */
function findPlayer(db, search, cb)
{
    db.first(['account_id', 'personaname', 'avatarfull']).from('players').where(search).asCallback(cb);
}

function searchPlayer(db, query, cb)
{
    async.parallel(
    {
        account_id: function(callback)
        {
            if (Number.isNaN(Number(query)))
            {
                return callback();
            }
            else
            {
                findPlayer(db,
                {
                    account_id: Number(query)
                }, callback);
            }
        },
        personaname: function(callback)
        {
            db.raw(`
                    SELECT * FROM
                    (SELECT account_id, personaname, avatarfull, similarity(personaname, ?)
                    FROM players WHERE personaname ILIKE ? LIMIT 1000) search
                    ORDER BY similarity DESC LIMIT 200
                    `, [query, '%' + query + '%']).asCallback(function(err, result)
            {
                if (err)
                {
                    return callback(err);
                }
                return callback(err, result.rows);
            });
        }
    }, function(err, result)
    {
        if (err)
        {
            return cb(err);
        }
        var ret = [];
        for (var key in result)
        {
            if (result[key])
            {
                ret = ret.concat(result[key]);
            }
        }
        cb(null, ret);
    });
}

/* lordstone: for store dem */

function storeDem(dem, db, cb)
{
	var user_id = dem.user_id;
	var dem_index = dem.dem_index;
	var is_public = dem.is_public;
	var upload_time = dem.upload_time;
	var replay_blob_key = dem.replay_blob_key
	var file_name = dem.file_name;
	var oid = dem.oid;

	db
	.table('dem_storage')
	.insert({
		user_id: user_id,
		dem_index: dem_index,
		is_public: is_public,
		upload_time: upload_time,
		file_name: file_name,
		oid: oid
	})
	.asCallback(function(err){
		if (err)
		{
			return cb(err);
		}
		return cb();
	});
}

/* lordstone: for get dem */

function getDem(params, db, cb)
{
	var dem_index = params.dem_index;
	var user_id = params.user_id;

	//console.log('DEBUG get dem from db:' + dem_index);
	console.time('fetching blob from db');
	db
	.table('dem_storage')
	.first('blob')//, 'is_public', 'upload_time', 'file_name')
	.where(
	{
		user_id: user_id,
		dem_index: dem_index
	})
	.asCallback(function(err, result)
	{
		//console.log('DEBUG received dem from db');
		console.timeEnd('fetching blob from db');
		if(err)
		{
			return cb(err);
		}
		return cb(null, result);
	});
}

function insertMantaMatch(db, redis, match, done)
{

	async.eachSeries(match, function(entry, cb){

		var user_id = entry.user_id;
		var is_public = entry.is_public;
		var upload_time = entry.upload_time;
		var replay_blob_key = entry.replay_blob_key;
		var dem_index = entry.dem_index;
		var steamid = entry.steamid;
		var match_id = entry.match_id;

		db
		.table('manta')
		.insert({
			steamid: steamid,
			match_id: match_id,
			user_id: user_id,
			is_public: is_public,
			upload_time: upload_time,
			dem_index: dem_index,
			replay_blob_key: replay_blob_key,
			player_name: entry.player_name,
			hero_id: entry.hero_id,
			hero_name: entry.hero_name,
			create_total_damages: entry.create_total_damages,
			create_deadly_damages: entry.create_deadly_damages,
			create_total_stiff_control: entry.create_total_stiff_control,
			create_deadly_stiff_control: entry.create_deadly_stiff_control,
			opponent_hero_deaths: entry.opponent_hero_deaths,
			create_deadly_damages_per_death: entry.create_deadly_damages_per_death,
			create_deadly_stiff_control_per_death: entry.create_deadly_stiff_control_per_death,
			rgpm: entry.rGpm,
			unrrpm: entry.unrRpm,
			killherogold: entry.killHeroGold,
			deadlosegold: entry.deadLoseGold,
			fedenemygold: entry.fedEnemyGold,
			teamnumber: entry.teamNumber,
			iswin: (entry.isWin ? 't' : 'f'),
			player_id: entry.player_id,
			alonekillednum: entry.aloneKilledNum,
			alonebecatchednum: entry.aloneBeCatchedNum,
			alonebekillednum: entry.aloneBeKilledNum,
			consumedamage: entry.consumeDamage
		})
		.asCallback(function(err){
			if (err)
			{
				return cb(err);
			}
			return cb();
		});
	}, done);
}

function insertMantaMatch2(db, redis, player_match, cb)
{
    async.each(player_match || [], function(entry, cb){
        var m_entry = {
            steamid: entry.steamid,
            match_id: entry.match_id,
            hero_id: entry.hero_id,
            create_total_damages: entry.create_total_damages,
            create_deadly_damages: entry.create_deadly_damages,
            create_total_stiff_control: entry.create_total_stiff_control,
            create_deadly_stiff_control: entry.create_deadly_stiff_control,
            opponent_hero_deaths: entry.opponent_hero_deaths,
            create_deadly_damages_per_death: entry.create_deadly_damages_per_death,
            create_deadly_stiff_control_per_death: entry.create_deadly_stiff_control_per_death,
            rgpm: entry.rGpm,
            unrrpm: entry.unrRpm,
            killherogold: entry.killHeroGold,
            deadlosegold: entry.deadLoseGold,
            fedenemygold: entry.fedEnemyGold,
            teamnumber: entry.teamNumber,
            iswin: entry.iswin,
            player_id: entry.player_id,
            alonekillednum: entry.aloneKilledNum,
            alonebecatchednum: entry.aloneBeCatchedNum,
            alonebekillednum: entry.aloneBeKilledNum,
            consumedamage: entry.consumeDamage,
            player_slot: entry.player_id >= 5 ? entry.player_id + 128 - 5 : entry.player_id
        }
        //console.log('player_slot : ' + m_entry.player_slot + '  player_id : ' + entry.player_id);
        upsert(db, 'player_matches', m_entry, {
            player_slot: m_entry.player_slot,
            match_id: m_entry.match_id,
        }, cb);
    }, cb);
}

module.exports = {
    getSets,
    insertPlayer,
    insertMatch,
    insertPlayerRating,
    insertMatchSkill,
    getDistributions,
    getTeamFetchedMatches,
    getTeamMatchInfo,
    getMantaParseData,
    getHeroAnalysisData,
    getLeagueList,
    getTeamPlayers,
    getPicks,
    getTop,
    getHeroRankings,
    getBenchmarks,
    benchmarkMatch,
    getMatchRating,
    upsert,
    getLeaderboard,
    mmrEstimate,
    searchPlayer,
	storeDem,
	getDem,
	insertMantaMatch,
    insertMantaMatch2
};
