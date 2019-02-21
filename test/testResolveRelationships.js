var assert = require('assert');

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
          locales: [
            {
              name: 'en',
              children: [
                {
                  name: 'fr'
                },
                {
                  name: 'de'
                }
              ]
            }
          ],
          defaultLocale: 'en',
          alias: 'workflow' // for testing only!
        },
        'products': {
          extend: 'apostrophe-pieces',
          name: 'product',
          alias: 'products',
          addFields: [
            {
              name: '_specialists',
              type: 'joinByArray'
            },
            {
              name: '_expert',
              withType: 'specialist',
              type: 'joinByOne'
            }
          ]
        },
        'specialists': {
          extend: 'apostrophe-pieces',
          name: 'specialist',
          alias: 'specialists'
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

  it('Add products and specialists as drafts, with joins; confirm relationships mapped correctly in new locale', () => {
    var req = apos.tasks.getReq();
    var specialist1 = apos.specialists.newInstance();
    var specialist2 = apos.specialists.newInstance();
    var product1 = apos.products.newInstance();
    var product2 = apos.products.newInstance();
    specialist1.title = 'specialist 1';
    specialist2.title = 'specialist 2';
    return apos.specialists.insert(req, specialist1).then(function() {
      return apos.specialists.insert(req, specialist2);
    }).then(function() {
      product1.title = 'product 1';
      product1.specialistsIds = [ specialist1._id ];
      product2.title = 'product 2';
      product2.specialistsIds = [ specialist2._id ];
      product1.expertId = specialist1._id;
      return apos.products.insert(req, product1);
    }).then(function(product1) {
      assert(product1.workflowLocale === 'en-draft');
      return apos.products.insert(req, product2);
    }).then(function(product2) {
      assert(product2.workflowLocale === 'en-draft');
      var frReq = apos.tasks.getReq({ locale: 'fr-draft' });
      return apos.products.find(frReq, { title: 'product 1' }).toObject();
    }).then(function(product1) {
      var frReq = apos.tasks.getReq({ locale: 'fr-draft' });
      assert(product1.workflowLocale === 'fr-draft');
      assert(product1._specialists[0].title === 'specialist 1');
      assert(product1._specialists[0].workflowLocale === 'fr-draft');
      assert(product1._expert.title === 'specialist 1');
      assert(product1._expert.workflowLocale === 'fr-draft');
      return apos.products.find(frReq, { title: 'product 2' }).toObject();
    }).then(function(product2) {
      assert(product2.workflowLocale === 'fr-draft');
      assert(product2._specialists[0].title === 'specialist 2');
      assert(product2._specialists[0].workflowLocale === 'fr-draft');
      assert(!product2._expert);
    });
  });

});
