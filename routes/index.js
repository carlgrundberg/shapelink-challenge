var q = require('q');
var express = require('express');
var moment = require('moment');
var router = express.Router();
var _ = require('underscore');
var config;
try{
    config = require('../config.json')
} catch(err){
    config = {}
}
config = _.extend(config, {
    challenge: 62937,
    startDate: "2015-07-01",
    endDate: "2015-12-31"
});
var Shapelink = require('shapelink-node-sdk').Shapelink;
var shapelink = new Shapelink(process.env.SHAPELINK_KEY || config.shapelink.apiKey, process.env.SHAPELINK_SECRET || config.shapelink.secret, 'sv', {}, true);

var db = require('mongojs')(process.env.MONGOLAB_URI || 'localhost/shapelink-challenge', ['users', 'results', 'challenges']);
db.users.createIndex({'token': 1}, {unique: true});

function storeUser(user) {
    shapelink.user.get({user_token: user.token, user_id: user.user_id}).then(
        function (data) {
            user = _.extend(
                user,
                _.pick(data.result.user, ['firstname', 'lastname', 'username', 'image']),
                {updated_at: new Date()}
            );
            db.users.update(
                {token: user.token},
                user,
                {upsert: true}
            );
        },
        function (err) {
            console.log(err);
        }
    );
}

function getDayResultForUser(user, date) {
    var deferred = q.defer();

    db.results.findOne({user_token: user.token, date: date, updated_at: { $gte: moment().subtract(1, 'hour').toDate()}}, function (err, result) {
        if (err) {
            deferred.reject(err);
        }

        if(!result) {
            shapelink.diary.getDay({user_token: user.token, date: date}).then(
                function (data) {
                    var total = 0;
                    for (var i = 0; i < data.result.done_workouts.length; i++) {
                        var workout = data.result.done_workouts[i];
                        total += workout.kcal;
                    }
                    var r = {
                        user_token: user.token,
                        date: date,
                        result: total,
                        updated_at: new Date()
                    };
                    db.results.update({user_token: user.token, date: r.date}, r, {upsert: true});
                    deferred.resolve(r);
                },
                deferred.reject
            );
        } else {
            deferred.resolve(result);
        }
    });



    return deferred.promise;
}

function getResultForUser(user, startDate, endDate) {
    var deferred = q.defer();
    var p = [];
    var now = moment();
    db.users.findOne({username: user.username}, function (err, user) {
        if (err) {
            deferred.reject(err);
            return;
        }

        if (!user) {
            deferred.reject();
            return;
        }

        for (var d = moment(startDate); d.isBefore(endDate) && d.isBefore(now); d = d.add(1, 'days')) {
            var date = d.format('YYYY-MM-DD');
            p.push(getDayResultForUser(user, date));
        }

        q.allSettled(p).done(function (results) {
            var result = {
                user: _.pick(user, ['user_id', 'firstname', 'lastname']),
                total: 0,
                dates: []
            };

            for (var i in results) {
                if (results[i].state == 'fulfilled') {
                    var r = results[i].value;
                    result.dates.push(r);
                    result.total += r.result;
                }
            }

            deferred.resolve(result);
        });
    });

    return deferred.promise;
}

function fixResults(r, label) {
    r.sort(function (a, b) {
        return a.total < b.total ? 1 : -1;
    });
    var p = 0;
    for (var i in r) {
        if (i == 0 || r[i].total != r[i - 1].total) {
            p = parseInt(i) + 1;
        }
        r[i].pos = p;
        r[i].total = Math.floor(r[i].total / 10);
    }
    return {
        results: r,
        label: label
    };
}

/* GET home page. */
router.get('/', function (req, res) {
    res.render('index', {
        title: 'Shapelink Challenge'
    });
});

router.post('/login', function (req, res) {
    shapelink.auth.requireToken({username: req.body.username, password: req.body.password}).then(
        function (data) {
            storeUser(data.result);
            res.send(data);
        },
        function (err) {
            res.status(400).send(err);
        }
    );
});

router.get('/challenge', function (req, res, next) {
    db.challenges.findOne({challenge_id: config.challenge, updated_at: { $gte: moment().subtract(1, 'hour').toDate()}}, function(err, challenge) {
        if(err) {
            next(err);
        }

        if(!challenge) {
            shapelink.challenge.getChallenge({user_token: req.query.token, challenge_id: config.challenge}).then(
                function (data) {
                    var challenge = _.extend(data.result, {updated_at: new Date(), challenge_id: data.result.id});
                    delete challenge.id;
                    db.challenges.update({challenge_id: config.challenge}, challenge, {upsert: true});
                    res.send(challenge);
                },
                next
            );
        } else {
            res.send(challenge);
        }
    });
});

function getResultsForChallenge(challenge, range) {
    var configStartDate = moment(config.startDate);
    var configEndDate = moment(config.endDate);
    var startDate = false;
    var endDate = false;
    var label = 'Standings';

    if (range == 'weekly') {
        startDate = moment().subtract(1, 'weeks').startOf('isoWeek');
        endDate = moment().subtract(1, 'weeks').endOf('isoWeek');
        label = 'Week ' + startDate.format('w');
    }
    if (range == 'monthly') {
        startDate = moment().subtract(1, 'month').startOf('month');
        endDate = moment().subtract(1, 'month').endOf('month');
        label = startDate.format('MMMM');
    }

    if (!startDate || startDate.isBefore(configStartDate)) {
        startDate = configStartDate;
    }

    if (!endDate || endDate.isAfter(configEndDate)) {
        endDate = configEndDate;
    }

    var deferred = q.defer();
    var r = [];
    var p = [];
    for (var i in challenge.results.data) {
        var participant = challenge.results.data[i];
        var user = participant.user;
        if (range == 'totals') {
            r.push({
                user: {user_id: user.id, firstname: user.username, lastname: ''},
                total: participant.value
            });
        } else {
            p.push(getResultForUser(user, startDate, endDate));
        }
    }
    if (p.length > 0) {
        q.allSettled(p).done(function (results) {
            for (var i in results) {
                if (results[i].state == 'fulfilled') {
                    r.push(results[i].value);
                }
            }
            deferred.resolve(fixResults(r, label));
        }, deferred.reject);
    } else {
        deferred.resolve(fixResults(r, label));
    }
    return deferred.promise;
}

router.get('/history/:range', function (req, res, next) {

    db.challenges.findOne({challenge_id: config.challenge}, function(err, challenge) {
        if (err) {
            next(err);
        }

        if (!challenge) {
            shapelink.challenge.getChallenge({user_token: req.query.token, challenge_id: config.challenge}).then(
                function (data) {
                    getResultsForChallenge(data.result, req.params.range).then(function(results) {
                        res.send(results);
                    }, next);
                }, next
            );
        } else {
            getResultsForChallenge(challenge, req.params.range).then(function(results) {
                res.send(results);
            }, next);;
        }
    });
});

module.exports = router;
