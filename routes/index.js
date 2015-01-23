var express = require('express');
var router = express.Router();
var config = require('..//config.json');

var Shapelink = require('../../shapelink-node-sdk').Shapelink;
var shapelink = new Shapelink(config.shapelink.apiKey, config.shapelink.secret, true);

/* GET home page. */
router.get('/', function(req, res, next) {
  res.render('index', { title: 'Toughest 2015' });
});

router.post('/login', function(req, res, next) {
    shapelink.auth().requireToken(req.body.username, req.body.password, function(data) {
        res.send(data);
    }, function(err) {
        res.status(400).send(err);
    });
});

router.get('/history/:exercise', function(req, res, next) {
    console.log(req.params.exercise);

    shapelink.diary().getStrengthExercises(req.query.token, function(data) {
        console.log(data);
        res.send();
    }, function(err) {
        res.status(400).send(err);
    });
});

module.exports = router;
