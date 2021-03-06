const each = require('async/each')
const omit = require('lodash.omit')
const pick = require('lodash.pick')

const models = require('../models')

function requireAdmin (req, res, next) {
  if (!req.user || !req.user.app_metadata || !req.user.app_metadata.isAdmin) {
    res.status(401).send('Unauthorized')
  } else {
    next()
  }
}

function makeFindQuery (req, query, isPublic) {
  const moreParams = { trashed: undefined }
  if (!isPublic) {
    moreParams.user = req.user.email
  }
  const dbQuery = Object.assign(query, moreParams)
  return dbQuery
}

function makeGenericModelResponseFn (res) {
  return (err, data) => {
    res.set('Content-Type', 'application/json')
    if (err) return serverError(res, err)
    res.json(data)
  }
}

function makeGetModelResponseFn (childModels, res, isCollection) {
  const genericResponder = makeGenericModelResponseFn(res)
  return (err, data) => {
    if (err) return genericResponder(err)
    if (!Array.isArray(data)) {
      data = [data]
    }

    respondWithData({
      childModels,
      data,
      genericResponder,
      isCollection
    })
  }
}

function makePublicGetModelResponseFn (config, req, res, isCollection) {
  const genericResponder = makeGenericModelResponseFn(res)
  return (err, data) => {
    if (err) return genericResponder(err)
    if (!Array.isArray(data)) {
      data = [data]
    }

    function doRespond () {
      respondWithData({
        childModels: config.childModels,
        data,
        genericResponder,
        isCollection,
        isPublic: true,
        obfuscateAddresses: config.obfuscateAddresses
      })
    }

    function sendDataIfEntityAllowsPublicAccess (entity) {
      if (entity && entity.reportConfig && entity.reportConfig.isPublic) {
        doRespond()
      } else {
        userError(res, 'Public access not allowed')
      }
    }

    function validateRequestingEntity () {
      if (!req.query.requester || !req.query.requester.entity) {
        return userError(res, 'requesting entity not set')
      }

      const {entity, id} = req.query.requester

      // fetch data
      switch (entity) {
        case 'site':
          models.Site.findOne(
            makeFindQuery(null, { _id: id }, true),
            (err, site) => {
              if (err) return genericResponder(err)
              if (!site) return userError(res, 'referenced site not found')
              if (site.id !== req.query.siteId) {
                return userError(res, 'invalid request: entity id mismatch')
              }
              sendDataIfEntityAllowsPublicAccess(site)
            }
          )
          break
        case 'multi-site':
          models.MultiSite.findOne(
            makeFindQuery(null, { _id: id }, true),
            (err, multiSite) => {
              if (err) return genericResponder(err)
              if (!multiSite) return userError(res, 'referenced multisite not found')
              const idSelector = config.name === 'commuter' ? 'siteId' : '_id'
              if (!multiSite.sites.every(siteId => {
                return req.query[idSelector]['$in'].indexOf('' + siteId) > -1
              })) {
                return userError(res, 'invalid request: entity ids mismatch')
              }
              sendDataIfEntityAllowsPublicAccess(multiSite)
            }
          )
          break
        default:
          return userError(res, 'invalid requester entity')
      }
    }

    switch (config.name) {
      case 'commuter':
      case 'polygon':
        if (!isCollection) {
          return userError(res, `Public get on single ${config.name} not allowed`)
        }
        validateRequestingEntity()
        break
      case 'multi-site':
        if (isCollection) {
          return userError(res, `Public get on mutliple multi-sites not allowed`)
        }
        sendDataIfEntityAllowsPublicAccess(data[0])
        break
      case 'site':
        if (isCollection) {
          validateRequestingEntity()
        } else {
          sendDataIfEntityAllowsPublicAccess(data[0])
        }
        break
      default:
        return serverError('Undefined config for public request')
    }
  }
}

/**
 * Make public rest endpoints
 *
 * @param  {Object} app The express app
 * @param  {Object} cfg Config object that has everything makeRestEndpoints
 *   has except for the commands option
 */
module.exports.makePublicRestEndpoints = function (app, cfg) {
  const model = cfg.model
  const modelFields = Object.keys(model.schema.paths)
  const name = cfg.name

  app.get(`/public-api/${name}`, (req, res) => {
    // TODO: security concern: findQuery uses any parsed json, allowing any kind of mongoose query
    model.find(
      makeFindQuery(req, pick(req.query, modelFields), true),
      makePublicGetModelResponseFn(cfg, req, res, true)
    )
  })

  app.get(`/public-api/${name}/:id`, (req, res) => {
    model.findOne(
      makeFindQuery(req, { _id: req.params.id }, true),
      makePublicGetModelResponseFn(cfg, req, res, false)
    )
  })
}

/**
 * Make a rest endpoint with the specified routes
 *
 * @param  {Object} app         The express app
 * @param  {Object} jwt         The jwt middleware if it should be used
 * @param  {Object} cfg         Configuration object with the following keys:
 * - {Object} commands    Keys representing commands to make and their corresponding options
 * - {String} name        The endpoint name
 * - {Object} model       The mongo model to use
 * - {Array} childModels  An optional array of object cfgs describing child relationships
 *   Has the following keys
 *   - {String} foreignKey     Foreign key field name in child model
 *   - {String} key            Children field to add in the paret data output
 *   - {Object} model          Child model
 */
module.exports.makeRestEndpoints = function (app, jwt, cfg) {
  const commands = cfg.commands
  const model = cfg.model
  const modelFields = Object.keys(model.schema.paths)
  const name = cfg.name
  if (commands['Collection DELETE']) {
    app.delete(`/api/${name}`, jwt, requireAdmin, (req, res) => {
      // TODO: security concern: findQuery uses any parsed json, allowing any kind of mongoose query
      const removeQuery = makeFindQuery(req, pick(req.query, modelFields))
      model.remove(removeQuery, makeGetModelResponseFn(cfg.childModels, res, true))
    })
  }

  if (commands['Collection GET']) {
    app.get(`/api/${name}`, jwt, requireAdmin, (req, res) => {
      // TODO: security concern: findQuery uses any parsed json, allowing any kind of mongoose query
      const findQuery = makeFindQuery(req, pick(req.query, modelFields))
      model.find(findQuery, makeGetModelResponseFn(cfg.childModels, res, true))
    })
  }

  if (commands['Collection POST']) {
    app.post(`/api/${name}`, jwt, requireAdmin, (req, res) => {
      res.set('Content-Type', 'application/json')
      if (!Array.isArray(req.body)) return userError(res, 'Invalid input data.  Expected an array.')
      const inputData = req.body.map((entity) => Object.assign(entity, { user: req.user.email }))
      model.create(inputData, makeGetModelResponseFn(cfg.childModels, res, true))
    })
  }

  if (commands['DELETE']) {
    app.delete(`/api/${name}/:id`, jwt, requireAdmin, (req, res) => {
      // don't use findByIdAndUpdate because it doesn't trigger pre('save') hook
      model.findOne(makeFindQuery(req, { _id: req.params.id }), (err, doc) => {
        if (err) return serverError(res, err)
        const modelResponder = makeGenericModelResponseFn(res)
        if (!doc) return userError(res, 'a database error occurred: record not found')
        doc.trash((err) => {
          modelResponder(err, doc)
        })
      })
    })
  }

  if (commands['GET']) {
    app.get(`/api/${name}/:id`, jwt, requireAdmin, (req, res) => {
      model.findOne(makeFindQuery(req, { _id: req.params.id }),
        makeGetModelResponseFn(cfg.childModels, res, false))
    })
  }

  if (commands['PUT']) {
    app.put(`/api/${name}/:id`, jwt, requireAdmin, (req, res) => {
      // don't use findByIdAndUpdate because it doesn't trigger pre('save') hook
      model.findOne(makeFindQuery(req, { _id: req.params.id }), (err, doc) => {
        if (err) return serverError(res, err)
        if (!doc) return userError(res, 'a database error occurred: record not found')
        doc.set(omit(req.body, 'user'))
        doc.save(makeGetModelResponseFn(cfg.childModels, res, false))
      })
    })
  }
}

function respondWithData ({
  childModels,
  data,
  genericResponder,
  isCollection,
  isPublic,
  obfuscateAddresses
}) {
  function censorData (record) {
    if (record._doc) {
      record = Object.assign({}, record._doc)
    }
    if (isPublic) {
      record = omit(record, ['user', '__v'])
      if (obfuscateAddresses) {
        record = omit(record, [
          'address',
          'city',
          'country',
          'county',
          'geocodeConfidence',
          'name',
          'originalAddress',
          'positionLastUpdated',
          'state'
        ])
        record.coordinate.lat += obfuscated()
        record.coordinate.lon += obfuscated()
      }
    }
    return record
  }

  if (!childModels) {
    return genericResponder(
      null,
      isCollection
        ? data.map(censorData)
        : censorData(data[0])
    )
  }

  // wow, awesome, with normalized mongoose models I get to make extra queries
  // to the db to do joins!  </sarcasm>
  const outputData = []
  each(data, (entity, entityCb) => {
    const curEntity = Object.assign({}, entity._doc)
    each(childModels, (childModel, childCb) => {
      childModel.model.find({
        [childModel.foreignKey]: curEntity._id,
        trashed: undefined,
        user: curEntity.user
      }, (err, childEntities) => {
        if (err) return childCb(err)
        curEntity[childModel.key] = childEntities.map((childEntity) => childEntity._id)
        childCb()
      })
    }, (err) => {
      if (err) return entityCb(err)
      outputData.push(censorData(curEntity))
      entityCb()
    })
  }, (err) => {
    genericResponder(err, isCollection ? outputData : outputData[0])
  })
}

function respondWithError (res, status, error) {
  console.error(error)
  res.status(status).json({ error })
}

function serverError (res, error) {
  respondWithError(res, 500, error)
}

function userError (res, error) {
  respondWithError(res, 400, error)
}

/**
 * Return a value to obfuscate a lat or lon position
 */
function obfuscated () {
  const choices = [-1, 1]
  return Math.random() / 1000 * choices[Math.floor(Math.random() * 2)]
}
