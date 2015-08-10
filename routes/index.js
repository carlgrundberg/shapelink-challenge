var q = require('q');
var express = require('express');
var moment = require('moment');
var router = express.Router();
var _ = require('underscore');
var config = {
    challenge: 62937,
    startDate: "2015-07-01",
    endDate: "2015-12-31"
};

var Shapelink = require('shapelink-node-sdk').Shapelink;
var shapelink = new Shapelink(process.env.SHAPELINK_KEY, process.env.SHAPELINK_SECRET, 'sv', {}, true);

var storage = require('node-persist');
storage.initSync({
    dir: __dirname + '/../db'
});

var users = storage.getItemSync('users') || {};


function storeUser(user) {
    shapelink.user.get({user_token: user.token, user_id: user.user_id}).then(
        function (data) {
            user.firstname = data.result.user.firstname;
            user.lastname = data.result.user.lastname;
            users[user.user_id] = user;
            storage.setItem('users', users);
        },
        function (err) {
            console.log(err);
        }
    );
}

function getDayResultForUser(user, date) {
    var deferred = q.defer();

    shapelink.diary.getDay({ user_token: user.token, date: date }).then(
        function (data) {
            var result = 0;
            for (var i = 0; i < data.result.done_workouts.length; i++) {
                var workout = data.result.done_workouts[i];
                result += workout.kcal;
            }
            deferred.resolve({date: date, result: result});
        },
        deferred.reject
    );

    return deferred.promise;
}

function getResultForUser(user, startDate, endDate) {
    var deferred = q.defer();
    var p = [];
    var now = moment();

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
    shapelink.auth.requireToken({username: req.body.username, password: req.body.password }).then(
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
    shapelink.challenge.getChallenge({user_token: req.query.token, challenge_id: config.challenge}).then(
        function (data) {
            res.send(data);
        },
        next
    );
});

router.get('/history/:range', function (req, res, next) {
    var configStartDate = moment(config.startDate);
    var configEndDate = moment(config.endDate);
    var startDate = false;
    var endDate = false;
    var label = 'Standings';

    if (req.params.range == 'weekly') {
        startDate = moment().subtract(1, 'weeks').startOf('isoWeek');
        endDate = moment().subtract(1, 'weeks').endOf('isoWeek');
        label = 'Week ' + startDate.format('w');
    }
    if(req.params.range == 'monthly') {
        startDate = moment().subtract(1, 'month').startOf('month');
        endDate = moment().subtract(1, 'month').endOf('month');
        label = startDate.format('MMMM');
    }

    if(!startDate || startDate.isBefore(configStartDate)) {
        startDate = configStartDate;
    }

    if(!endDate || endDate.isAfter(configEndDate)) {
        endDate = configEndDate;
    }

    shapelink.challenge.getChallenge({user_token: req.query.token, challenge_id: config.challenge}).then(
        function(data) {
            var r = [];
            var p = [];
            for(var i in data.result.results.data) {
                var participant = data.result.results.data[i];
                var user = participant.user;
                if(req.params.range == 'totals') {
                    r.push({user: { user_id: user.id, firstname: user.username, lastname: '' }, total: participant.value});
                } else if(users[user.id]) {
                    p.push(getResultForUser(users[user.id], startDate, endDate));
                }
            }
            if(p.length > 0) {
                q.allSettled(p).done(function (results) {
                    for(var i in results) {
                        if (results[i].state == 'fulfilled') {
                            r.push(results[i].value);
                        }
                    }
                    res.send(fixResults(r, label));
                }, next);
            } else {
                res.send(fixResults(r, label));
            }
       }, next
    );
});

module.exports = router;
