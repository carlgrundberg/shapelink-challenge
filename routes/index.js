var express = require('express');
var router = express.Router();
var config = require('../config.json');

var Shapelink = require('../../shapelink-node-sdk').Shapelink;
var shapelink = new Shapelink(config.shapelink.apiKey, config.shapelink.secret, 'sv', true);

/* GET home page. */
router.get('/', function(req, res, next) {
  res.render('index', { title: config.name });
});

router.post('/login', function(req, res, next) {
    shapelink.auth().requireToken(req.body.username, req.body.password, function(data) {
        res.send(data);
    }, function(err) {
        res.status(400).send(err);
    });
});

router.get('/history', function(req, res, next) {

    shapelink.diary().getStrengthExercises(req.query.token, function(data) {
        for(var i in data.result) {
            for(var j in data.result[i]) {
                var exercise = data.result[i][j];
                if(exercise.name.toLowerCase().indexOf(config.exercise) != -1) {
                    shapelink.statistics().getStrengthExerciseHistory(req.query.token, exercise.id, config.startDate, config.endDate, function(data) {
                        res.send(data);
                    }, function(err) {
                        res.status(400).send(err);
                    });
                    return;
                }
            }
        }
        // Exercise not found
        res.status(400).send({ error: 'No exercise found'});
    }, function(err) {
        res.status(400).send(err);
    });
});

module.exports = router;
