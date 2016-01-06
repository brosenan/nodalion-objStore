"use strict";
var assert = require('assert');
var fs = require('fs');
var $S = require('suspend'), $R = $S.resume, $RR = $S.resumeRaw, $T = function(gen) { return function(done) { $S.run(gen, done); } };
var objStore = require('../objStore.js');
var express = require('express');
var nodalionHttp = require('nodalion-http');
var request = require('request');

var Nodalion = require('nodalion');
require('../objStore.js').configure({
    provider: 'filesystem',
    root: '/tmp',
    container: 'objStoreTest',
});

var ns = Nodalion.namespace('/nodalion', ['objStoreAdd', 'objStoreCat', 'objStoreToTmp']);
var nodalion = new Nodalion(Nodalion.__dirname + '/prolog/cedalion.pl', '/tmp/objStore.log');
var example = Nodalion.namespace('example', ['myObjStoreApp']);

var doTask = function(task, cb) {
    task.meaning()(nodalion, cb);
};

describe('nodalion-objstore', function(){
    before($T(function*() {
	fs.mkdirSync('/tmp/objStoreTest');
    }));
    after($T(function*() {
	yield require('child_process').spawn('rm', ['-rf', '/tmp/objStoreTest']).on('exit', $RR());
    }));
    describe('/nodalion#objStoreAdd(Str)', function(){
	it('should turn a string into a hash', $T(function*(){
	    var hash = yield doTask(ns.objStoreAdd("Hello, World\n"), $R());
	    var str = yield objStore.getString(hash, $R());
	    assert.equal(str, 'Hello, World\n');
	}));
    });

    describe('/nodalion#objStoreCat(Hash)', function(){
	it('should turn a hash into a string', $T(function*(){
	    var hash = yield objStore.addString("Hello, World\n", $R());
	    var str = yield doTask(ns.objStoreCat(hash), $R());
	    assert.equal(str, "Hello, World\n");
	}));
    });

    describe('/nodalion#objStoreToTmp(Hash)', function(){
	it('should create a temporary file with the content under Hash and return its path', $T(function*(){
	    var hash = yield objStore.addString("Hello, World\n", $R());
	    var path = yield doTask(ns.objStoreToTmp(hash), $R());
	    var reader = fs.createReadStream(path);
	    var result = '';
	    reader.setEncoding('utf-8');
	    reader.on('data', data => { result += data; });
	    yield reader.on('end', $RR());
	    assert.equal(result, 'Hello, World\n');
	}));

    });

    describe('/nodalion#objStoreBody', function(){
	before($T(function*() {
	    var impred = Nodalion.namespace('/impred', ['pred']);
	    var builtin = Nodalion.namespace('builtin', ['true']);
	    yield nodalion.findAll([], impred.pred(builtin.true()), $R());

	    var app = express();
	    app.use(nodalionHttp.app(nodalion, example.myObjStoreApp()));
	    app.listen(3002);
	    yield setTimeout($R(), 10); // Give the app time to go up
	}));
	it('should handle objStore content requests', $T(function*(){
	    var hash = yield objStore.addString('Hello, World\n', $R());
	    var resp = yield request('http://localhost:3002/objStore/' + hash, $RR());
	    assert.ifError(resp[0]);
	    assert.equal(resp[1].statusCode, 200);
	    assert.equal(resp[1].headers['content-type'].split(';')[0], 'text/foo');
	    assert.equal(resp[2], 'Hello, World\n');
	}));
	it('should handle objStore add requests', $T(function*(){
	    var resp = yield request({
		url: 'http://localhost:3002/objStore',
		method: 'POST',
		headers: {'content-type': 'text/foo'},
		body: 'Hello, World\n',
	    }, $RR());
	    assert.ifError(resp[0]);
	    assert.equal(resp[1].statusCode, 200);
	    var url = JSON.parse(resp[2]).url;
	    resp = yield request(url, $RR());
	    assert.ifError(resp[0]);
	    assert.equal(resp[1].statusCode, 200);
	    assert.equal(resp[2], 'Hello, World\n');
	}));
    });
    
});
