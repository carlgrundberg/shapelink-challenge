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

function getExercisesForUser(user) {
    var deferred = q.defer();
    var exercises = [];
    shapelink.diary().getStrengthExercises(user.token, function (data) {
        for (var i in data.result) {
            for (var j in data.result[i]) {
                var exercise = data.result[i][j];
                if (exercise.name.toLowerCase().indexOf(config.exercise) != -1) {
                    exercises.push(exercise);
                }
            }
        }
        if(exercises.length) {
            deferred.resolve(exercises);
        } else {
            // Exercise not found
            deferred.reject({error: 101, message: 'No exercise found'});
        }
    }, function (err) {
        deferred.reject(err);
    });
    return deferred.promise;
}

function getResultForUser(user) {
    if (!user.firstname) {
        storeUser({
            user_id: user.user_id,
            token: user.token
        });
    }

    var deferred = q.defer();

    getExercisesForUser(user).then(function(exercises) {
        var result = {
            user: _.pick(user, ['user_id', 'firstname', 'lastname']),
            reps: 0
        };
        var finished = 0;
        for(var i in exercises) {
            shapelink.statistics().getStrengthExerciseHistory(user.token, exercises[i].id, config.startDate, config.endDate, function (data) {
                result.reps += data.result.totals.reps;
                if(++finished == exercises.length) {
                    deferred.resolve(result);
                }
            });
        }
    }).fail(function(err) {
        deferred.reject(err);
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

router.get('/history', function (req, res, next) {
    if (!users[req.query.user_id] || !users[req.query.user_id].firstname) {
        storeUser({
            user_id: req.query.user_id,
            token: req.query.token
        });
    }
    var user = users[req.query.user_id];

    getResultForUser(user).then(function(data) {
        res.send(data);
    }).catch(next);
});

router.get('/toplist', function(req, res, next) {
    var p = [];
    for(var user_id in users) {
        p.push(getResultForUser(users[user_id]));
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
           return a.reps < b.reps ? 1 : -1;
        });
        var p = 0;
        for(var i in r) {
            if(i == 0 || r[i].reps != r[i-1].reps) {
                p++;
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
