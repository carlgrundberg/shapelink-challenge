var q = require('q');
var express = require('express');
var moment = require('moment-timezone');
moment.locale('sv');
moment.tz.setDefault("Europe/Stockholm");
var router = express.Router();
var _ = require('underscore');
var config;
try {
    config = require('../config.json')
} catch (err) {
    config = {}
}
config = _.extend(config, {
    challenge: 62937,
    startDate: "2015-07-01",
    endDate: "2015-12-31"
});
var Shapelink = require('shapelink').Shapelink;
var shapelink = new Shapelink(process.env.SHAPELINK_KEY || config.shapelink.apiKey, process.env.SHAPELINK_SECRET || config.shapelink.secret, 'sv', {}, true);

var ap = require('activity-points');

var db = require('mongojs')(process.env.MONGOLAB_URI || 'localhost/shapelink-challenge', ['users', 'results', 'challenges'], {authMechanism: 'ScramSHA1'});
db.users.createIndex({'token': 1}, {unique: true});

function storeUser(user) {
    var deferred = q.defer();
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
                {upsert: true},
                deferred.resolve
            );
        }, deferred.reject
    );
    return deferred.promise;
}

/* GET home page. */
router.get('/', function (req, res) {
    res.render('index', {
        title: 'Shapelink Challenge'
    });
});

router.post('/login', function (req, res, next) {
    shapelink.auth.requireToken({username: req.body.username, password: req.body.password}).then(
        function (data) {
            storeUser(data.result).then(function () {
                res.send(data)
            }, next);
        },
        function (err) {
            res.status(400).send(err);
        }
    );
});

function getChallenge(challenge_id) {
    var deferred = q.defer();

    db.challenges.findOne({
        challenge_id: challenge_id
    }, function (err, challenge) {
        if (err) {
            deferred.reject(err);
            return;
        }

        challenge.updated_at_formatted = moment(challenge.updated_at).calendar();
        deferred.resolve(challenge);
    });

    return deferred.promise;
}

router.get('/challenge', function (req, res, next) {
    // do this since we in the first version didnt save users to db
    var resFn = function () {
        getChallenge(config.challenge).then(function (challenge) {
            res.send(challenge);
        }, next);
    };

    db.users.findOne({token: req.query.token}, function (err, user) {
        if (!user) {
            storeUser(req.query).then(resFn)
        } else {
            resFn();
        }
    });

});

function getUserForResult(result) {
    var d = q.defer();
    db.users.findOne({user_id: result.user_id}, function (err, user) {
        if (err) {
            d.reject(err);
            return;
        }
        if (user) {
            user.id = user.user_id;
            result.user = _.pick(user, ['id', 'firstname', 'lastname', 'username', 'image']);
            delete result.user_id;
        }
        d.resolve(user);
    });
    return d.promise;
}


function getResults(args, res, next) {
    db.results.aggregate(args, function (err, results) {
        if (err) {
            next(err);
            return;
        }

        var p = [];

        for (var i in results) {
            var result = results[i];
            if (result.user_id) {
                p.push(getUserForResult(result));
            }
        }

        q.allSettled(p).then(function () {
            res.send(results);
        });
    });
}

router.get('/results', function (req, res, next) {
    var args = [
        {$project: {user_id: "$user_id", result: "$result"}},
        {$group: {_id: "$user_id", result: {$sum: "$result"}}},
        {$project: {_id: 0, user_id: "$_id", result: "$result"}},
        {$sort: {"result": -1}}
    ];

    getResults(args, res, next);
});

router.get('/results/:range', function (req, res, next) {
    var period;
    switch (req.params.range) {
        case 'weekly':
            period = {$week: "$local_date"};
            break;
        case 'monthly':
            period = {$month: "$local_date"};
            break;
        default:
            res.status(502).send('Wrong range');
            return;
    }

    var args = [
        {$project: {user_id: "$user_id", result: "$result", period: period}},
        {$group: {_id: {user_id: "$user_id", period: "$period"}, result: {$sum: "$result"}}},
        {$sort: {"result": -1}},
        {$group: {_id: "$_id.period", users: {$push: {user_id: "$_id.user_id", result: "$result"}}}},
        {$project: {_id: 0, period: "$_id", results: "$users"}},
        {$sort: {"period": 1}}
    ];

    // Account for timezone diff so result is used in correct week/month
    var diff = 0 - moment.tz.zone("Europe/Stockholm").offset(new Date()) * 60 * 1000;

    // mongo week aggregation uses sunday as first day of week so move all result 6 days forward, which also gives us correct week number
    if (req.params.range == 'weekly') {
        diff += (6 * 24 * 60 * 60 * 1000);
    }

    if (diff != 0) {
        args.unshift({$project: {user_id: "$user_id", result: "$result", local_date: {$add: ["$date", diff]}}});
    }

    getResults(args, res, next);
});

function getWeight(notations, date) {
    var i = 0;
    while (i < notations.length && notations[i].date.isAfter(date, 'day')) {
        i++;
    }
    return notations[i].weight;
}

function getWorkouts(req, res, startDate, endDate) {
    console.log("start", startDate.toDate());
    console.log("end", endDate.toDate());
    shapelink.diarynotation({user_token: req.query.token, types: 'weight', limit: 20}).done(function (data) {
        if (data.result.diarynotations.length == 0) {
            res.status(400).send({
                error: {
                    message: 'No weight information'
                }
            });
            return;
        }
        var weight_notations = [];
        for (var i in data.result.diarynotations) {
            var n = data.result.diarynotations[i].data;
            weight_notations.push({date: moment(n.date), weight: n.value})
        }
        var intensity_convert = {
            "low": "low",
            "normal": "moderate",
            "high": "high"
        };
        var week = startDate.format('W');

        shapelink.workout.get({user_token: req.query.token, min_date: startDate.format('YYYY-MM-DD'), max_date: endDate.format('YYYY-MM-DD')}).done(function(data) {
               var weight;
               var activity;
               var workout;
               var r = [];
               var duration;
               var intensity;
               for (var i = 0; i < data.result.workouts.length; i++) {
                   workout = data.result.workouts[i];
                   weight = getWeight(weight_notations, workout.date);
                   if(workout.cardiogym_activities.length > 0) {
                       for(var j = 0; j < workout.cardiogym_activities.length; j++) {
                           activity = workout.cardiogym_activities[j];
                           duration = Math.round(activity.duration / 60);
                           intensity = intensity_convert[activity.intensity];
                           r.push({
                               id: workout.id,
                               date: workout.date,
                               icon: activity.icon_id,
                               activity: activity.activity,
                               duration: duration,
                               intensity: intensity,
                               weight: weight,
                               points: ap.calculate(weight, duration, intensity)
                           });
                       }
                   } else {
                       duration = Math.round(workout.duration / 60);
                       intensity = intensity_convert[workout.intensity];
                       r.push({
                           id: workout.id,
                           date: workout.date,
                           icon: workout.icon_id,
                           activity: workout.activity,
                           duration: duration,
                           intensity: intensity,
                           weight: weight,
                           points: ap.calculate(weight, duration, intensity)
                       });
                   }

               }
               res.send({
                   week: week,
                   workouts: r
               });
           }
        );
    });
}

router.get('/workouts/:week', function (req, res, next) {
    var startDate = moment();
    if(req.params.week == 'prev') {
        startDate = startDate.subtract(7, 'days');
    }
    startDate.startOf('week');
    var endDate = moment(startDate);
    endDate.endOf('week');

    getWorkouts(req, res, startDate, endDate);
});

module.exports = router;
