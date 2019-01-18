var assert = require('assert');
var async = require('async');
var revertId;
var _ = require('@sailshq/lodash');

describe('Workflow API', function() {
  this.timeout(5000);
  var apos;

  after(function(done) {
    require('apostrophe/test-lib/util').destroy(apos, done);
  });

  it('should be a property of the apos object', function(done) {
    apos = require('apostrophe')({
      testModule: true,

      modules: {
        'apostrophe-pages': {
          park: [],
          types: [
            {
              name: 'home',
              label: 'Home'
            },
            {
              name: 'testPage',
              label: 'Test Page'
            }
          ]
        },
        'apostrophe-workflow': {
          settings: {
            locales: ['default'],
            defaultLocale: 'default'
          },
          alias: 'workflow' // for testing only!
        },
        'products': {
          extend: 'apostrophe-pieces',
          name: 'product',
          alias: 'products'
        }
      },
      afterInit: function(callback) {
        assert(apos.modules['apostrophe-workflow']);
        return callback(null);
      },
      afterListen: function(err) {
        assert(!err);
        done();
      }
    });
  });

  it('Test add draft product to db as draft', () => {
    var req = apos.tasks.getReq();
    var product = apos.products.newInstance();
    product.title = 'initial title';
    product.tags = [];
    return apos.products.insert(req, product)
      .then(doc => {
        assert(doc.type === 'product');
        assert(doc.workflowGuid);
        assert(doc.workflowLocale === 'default-draft');
      });
  });

  // block repeats
  it('Commit a change', (done) => {
    var req = apos.tasks.getReq({locale: 'default-draft'});

    async.waterfall([getProductDraft, updateProductDraft, commitUpdate], (err, res) => {
      assert(!err);
      assert(typeof res === 'string', 'response should be an id');
      done();
    });

    function getProductDraft(cb) {
      apos.products.find(req).toArray().then(docs => {
        assert(docs[0]);
        return cb(null, docs[0]);
      })
        .catch(e => {
          return cb(e);
        });
    }

    function updateProductDraft(product, cb) {
      product.title = 'new title';
      apos.products.update(req, product, (err, res) => {
        return cb(err, res);
      });
    }

    function commitUpdate(product, cb) {
      apos.workflow.commitLatest(req, product._id, (err, res) => {
        revertId = res;
        return cb(err, res);
      });
    }
  });

  it('Check for live document after commit', done => {
    const req = apos.tasks.getReq();
    apos.products.find(req).toArray().then(docs => {
      assert(docs[0].title === 'new title');
      assert(!docs[0].trash);
      done();
    });
  });
  // end block repeats

  // block repeats
  it('Commmit a change', (done) => {
    var req = apos.tasks.getReq({locale: 'default-draft'});

    async.waterfall([getProductDraft, updateProductDraft, commitUpdate], (err, res) => {

      assert(!err);
      assert(typeof res === 'string', 'response should be an id');
      done();
    });

    function getProductDraft(cb) {
      apos.products.find(req).toArray().then(docs => {
        assert(docs[0]);
        return cb(null, docs[0]);
      })
        .catch(e => {
          return cb(e);
        });
    }

    function updateProductDraft(product, cb) {
      product.title = 'new title 2';
      apos.products.update(req, product, (err, res) => {
        return cb(err, res);
      });
    }

    function commitUpdate(product, cb) {
      apos.workflow.commitLatest(req, product._id, (err, res) => {
        return cb(err, res);
      });
    }
    // end block repeats
  });

  it('Check for live document after commit', done => {
    const req = apos.tasks.getReq();
    apos.products.find(req).toArray().then(docs => {
      assert(docs[0].title === 'new title 2');
      assert(!docs[0].trash);
      // Verifies base case for the next group of tests. -Tom
      assert(Array.isArray(docs[0].tags));
      done();
    });
  });

  it('Commit a change that deletes a property', (done) => {
    var req = apos.tasks.getReq({locale: 'default-draft'});

    async.waterfall([getProductDraft, updateProductDraft, commitUpdate], (err, res) => {

      assert(!err);
      assert(typeof res === 'string', 'response should be an id');
      done();
    });

    function getProductDraft(cb) {
      apos.products.find(req).toArray().then(docs => {
        assert(docs[0]);
        return cb(null, docs[0]);
      })
        .catch(e => {
          return cb(e);
        });
    }

    function updateProductDraft(product, cb) {
      delete product.tags;
      apos.products.update(req, product, (err, res) => {
        return cb(err, res);
      });
    }

    function commitUpdate(product, cb) {
      apos.workflow.commitLatest(req, product._id, (err, res) => {
        return cb(err, res);
      });
    }
    // end block repeats
  });

  it('Check for live document after commit: no more tags property', done => {
    const req = apos.tasks.getReq();
    apos.products.find(req).toArray().then(docs => {
      assert(docs[0].title === 'new title 2');
      assert(!docs[0].trash);
      assert(!_.has(docs[0], 'tags'));
      done();
    });
  });

  it('Test revert', done => {
    const req = apos.tasks.getReq();
    assert(revertId);

    async.waterfall([revert, check], (err, docs) => {
      assert(!err);
      assert(docs[0].title === 'new title');
      assert(!docs[0].trash);
      done();
    });

    function revert (cb) {
      apos.workflow.revert(req, revertId, (err, res) => {
        assert(!err);
        cb(err);
      });
    }

    function check (cb) {
      var req = apos.tasks.getReq({locale: 'default-draft'});
      apos.products.find(req).toArray().then(docs => {
        cb(null, docs);
      }).catch(cb);
    }
  });

  it('Test revert to live', done => {
    const req = apos.tasks.getReq({ locale: 'default-draft' });

    async.waterfall([ getProduct, revertToLive, check ], (err, docs) => {
      assert(!err);
      assert(docs[0].title === 'new title 2');
      assert(!docs[0].trash);
      done();
    });

    function getProduct (cb) {
      apos.products.find(req).toObject(cb);
    }

    function revertToLive (product, cb) {
      apos.workflow.revertToLive(req, product._id, (err, res) => {
        assert(!err);
        cb(err);
      });
    }

    function check (cb) {
      var req = apos.tasks.getReq({locale: 'default-draft'});
      apos.products.find(req).toArray(cb);
    }
  });

  it('1 doc committable after a modification to product, 0 after commit', done => {
    const req = apos.tasks.getReq({ locale: 'default-draft' });
    async.waterfall([ getProductDraft, updateProductDraft, _.partial(checkCommittable, 1, 'new title 3'), commit, _.partial(checkCommittable, 0) ], function(err) {
      assert(!err);
      done();
    });

    function getProductDraft(cb) {
      apos.products.find(req).toObject(cb);
    }

    function updateProductDraft(product, cb) {
      product.title = 'new title 3';
      apos.products.update(req, product, cb);
    }

    function commit(product, db) {
      apos.workflow.commitLatest(req, product._id, cb);
    }

    function checkCommittable(n, title0) {
      apos.workflow.getCommittable(req, {}, function(err, committable) {
        assert(!err);
        assert(committable.length === n);
        if ((n > 0) && (title0)) {
          assert(committable[0].title === title0);
        }
        done();
      });
    }

  });
});
