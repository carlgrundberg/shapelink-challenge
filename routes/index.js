var q = require('q');
var express = require('express');
var moment = require('moment');
var router = express.Router();
var config = require('../config.json');
var _ = require('underscore');

var Shapelink = require('../../shapelink-node-sdk').Shapelink;
var shapelink = new Shapelink(config.shapelink.apiKey, config.shapelink.secret, 'sv', true);

var storage = require('node-persist');
storage.initSync({
    dir: __dirname + '/../db'
});

var users = storage.getItemSync('users') || {};


function storeUser(user) {
    shapelink.user().get(user.token, user.user_id, function(data) {
        user.firstname = data.result.user.firstname;
        user.lastname = data.result.user.lastname;
        users[user.user_id] = user;
        storage.setItem('users', users);
    }, function(err) {
       console.log(err);
    });
}

function getDayResultForUser(user, day) {
    var deferred = q.defer();

    shapelink.diary().getDay(user.token, day, function(data) {
        var result = 0;
        for(var i = 0; i < data.result.done_workouts.length; i++) {
            var workout = data.result.done_workouts[i];
            result += workout.kcal;
        }
        deferred.resolve({day: day, result: result});
    }, function(err) {
        deferred.reject(err);
    });

    return deferred.promise;
}

function getResultForUser(user, startDate, endDate) {
    var deferred = q.defer();
    var p = [];
    var now = moment();

    for (var d = moment(startDate); d.isBefore(endDate) && d.isBefore(now); d = d.add(1, 'days')) {
        var day = d.format('YYYY-MM-DD');
        p.push(getDayResultForUser(user, day));
    }

    q.allSettled(p).done(function(results) {
        var result = {
            user: _.pick(user, ['user_id', 'firstname', 'lastname']),
            total: 0,
            days: []
        };

        for(var i in results) {
            if(results[i].state == 'fulfilled') {
                var r = results[i].value;
                result.days.push(r);
                result.total += r.result;
            }
        }

        deferred.resolve(result);
    });

    return deferred.promise;
}
/* GET home page. */
router.get('/', function (req, res) {
    res.render('index', {
        title: config.name,
        goal: config.goal,
        days: moment(config.endDate).diff(moment(), 'days')
    });
});

router.post('/login', function (req, res) {
    shapelink.auth().requireToken(req.body.username, req.body.password, function (data) {
        storeUser(data.result);
        res.send(data);
    }, function (err) {
        res.status(400).send(err);
    });
});

router.get('/history/:range', function(req, res, next) {
    var startDate = moment(config.startDate);
    var endDate = moment(config.endDate);
    if(req.params.range == 'weekly') {
        startDate = moment().subtract(1, 'weeks').startOf('isoWeek');
        endDate = moment().subtract(1, 'weeks').endOf('isoWeek');
    }

    var p = [];
    for(var user_id in users) {
        p.push(getResultForUser(users[user_id], startDate, endDate));
    }
    q.allSettled(p).done(function(results) {
        var r = [];
        for(var i in results) {
            if(results[i].state == 'fulfilled') {
                var result = results[i].value;
                r.push(result)
            }
        }
        r.sort(function(a, b) {
           return a.total < b.total ? 1 : -1;
        });
        var p = 0;
        for(var i in r) {
            if(i == 0 || r[i].total != r[i-1].total) {
                p = parseInt(i) + 1;
            }
            r[i].pos = p;
        }
        res.send(r);
    }, function(err) {
        console.log(err);
        if (err.error != 101) {
            next(err);
        }
    });
});

module.exports = router;
