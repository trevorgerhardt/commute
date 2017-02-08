import hslToHex from 'colorvert/hsl/hex'
import {toCoordinates, toLeaflet} from '@conveyal/lonlat'
import {Browser, icon, latLngBounds} from 'leaflet'
import React, {Component, PropTypes} from 'react'
import {Button, ButtonGroup, Col, Grid, ProgressBar, Row, Tab, Table, Tabs} from 'react-bootstrap'
import {BootstrapTable, TableHeaderColumn} from 'react-bootstrap-table'
import {GeoJSON, Map as LeafletMap, Marker, TileLayer} from 'react-leaflet'
import distance from '@turf/distance'

import BackButton from '../containers/back-button'
import ButtonLink from './button-link'
import FieldGroup from './fieldgroup'
import messages from '../utils/messages'
import {arrayCountRenderer} from '../utils/table'
import {actUponConfirmation} from '../utils/ui'

export default class Site extends Component {
  static propTypes = {
    // props
    isMultiSite: PropTypes.bool.isRequired,
    multiSite: PropTypes.object,
    polygonStore: PropTypes.object,
    site: PropTypes.object,
    sites: PropTypes.array,
    siteStore: PropTypes.object,
    commuters: PropTypes.array.isRequired,

    // dispatch
    deleteCommuter: PropTypes.func,
    deleteMainEntity: PropTypes.func.isRequired,
    deletePolygons: PropTypes.func.isRequired,
    loadCommuters: PropTypes.func.isRequired,
    loadPolygons: PropTypes.func,
    loadSite: PropTypes.func
  }

  componentWillMount () {
    this.state = {
      activeTab: this.props.isMultiSite ? 'sites' : 'commuters',
      analysisMode: 'TRANSIT',
      isochroneColoring: 'multi-color'
    }
    this._loadDataIfNeeded(this.props)
  }

  componentWillReceiveProps (nextProps) {
    this._loadDataIfNeeded(nextProps)
  }

  componentWillUnmount () {
    if (this.loadSiteInterval) {
      clearInterval(this.loadSiteInterval)
    }

    if (this.loadCommutersInterval) {
      clearInterval(this.loadCommutersInterval)
    }
  }

  _commuterSiteNameRenderer = (cell, row) => {
    const {siteStore} = this.props
    return siteStore[row.siteId].name
  }

  _commuterToolsRenderer = (cell, row) => {
    const {site} = this.props
    return <ButtonGroup>
      <ButtonLink
        bsStyle='warning'
        to={`/site/${site._id}/commuter/${row._id}/edit`}>
        Edit
      </ButtonLink>
      <Button bsStyle='danger' onClick={this._onDeleteCommuterClick.bind(this, row)}>Delete</Button>
    </ButtonGroup>
  }

  _handleAnalysisModeChange = (name, event) => {
    this.setState({ analysisMode: event.target.value })
  }

  _handleDelete = () => {
    const {deleteMainEntity, deletePolygons, isMultiSite, multiSite, site} = this.props
    const doDelete = () => {
      deleteMainEntity(isMultiSite ? multiSite : site)
      if (!isMultiSite) {
        deletePolygons({ siteId: site._id })
      }
    }
    const messageType = isMultiSite ? 'multiSite' : 'site'
    actUponConfirmation(messages[messageType].deleteConfirmation, doDelete)
  }

  _handleTabSelect = (selectedTab) => {
    this.setState({ activeTab: selectedTab })
  }

  _loadDataIfNeeded (props) {
    const {
      commuters,
      isMultiSite,
      loadCommuters,
      loadPolygons,
      loadSite,
      multiSite,
      polygonStore,
      site,
      sites
    } = props

    /***************************************************************
     determine if commuters should be loaded
    ***************************************************************/
    let shouldLoadCommuters = false

    const allCommutersLoadedFromAllSites = () => {
      let numCommutersInSites = sites.reduce((accumulator, currentSite) => {
        return accumulator + currentSite.commuters.length
      }, 0)
      return numCommutersInSites === commuters.length
    }

    // check if all commuters have been loaded
    if ((!isMultiSite && (site.commuters.length > commuters.length)) ||
      (isMultiSite && !allCommutersLoadedFromAllSites())) {
      // not all commuters loaded in store
      shouldLoadCommuters = true
    } else {
      // check if all commuters have been geocoded and have stats calculated
      for (let i = 0; i < commuters.length; i++) {
        const curCommuter = commuters[i]
        const isGeocoded = curCommuter.geocodeConfidence !== -1
        const hasStats = curCommuter.modeStats
        if (!isGeocoded || !hasStats) {
          shouldLoadCommuters = true
          break
        }
      }
    }

    if (shouldLoadCommuters && !this.loadCommutersInterval) {
      // load commuters if not already doing so
      let loadCommutersQuery
      if (isMultiSite) {
        // query for commuters at all siteIds
        loadCommutersQuery = {
          siteId: {
            $in: multiSite.sites
          }
        }
      } else {
        // load commuters only from specific site
        loadCommutersQuery = { siteId: site._id }
      }
      this.loadCommutersInterval = setInterval(() => {
        loadCommuters(loadCommutersQuery)
      }, 1111)
    } else if (!shouldLoadCommuters && this.loadCommutersInterval) {
      clearInterval(this.loadCommutersInterval)
    }

    /***************************************************************
     determine if site should be loaded
    ***************************************************************/
    if (site &&
      site.calculationStatus === 'calculating') {
      // should load site
      if (!this.loadSiteInterval) {
        this.loadSiteInterval = setInterval(() => {
          loadSite(site._id)
        }, 1111)
      }
    } else {
      // site doens't need to load
      if (this.loadSiteInterval) {
        clearInterval(this.loadSiteInterval)
      }
    }

    /***************************************************************
     determine if polygons should be loaded
    ***************************************************************/
    if (site &&
      site.calculationStatus === 'successfully') {
      // if 0 polygons exist for site, assume they need to be fetched
      if (!Object.values(polygonStore).some((isochrone) => isochrone.siteId === site._id)) {
        loadPolygons({ siteId: site._id })
      }
    }
  }

  _mapSitesAndCommuters = () => {
    const {commuters, isMultiSite, site, sites} = this.props
    const markers = []
    let sitesToMakeMarkersFor

    if (isMultiSite) {
      sitesToMakeMarkersFor = sites
    } else {
      sitesToMakeMarkersFor = [site]
    }

    const firstSiteCoordinates = toLeaflet(sitesToMakeMarkersFor[0].coordinate)
    const bounds = latLngBounds([firstSiteCoordinates, firstSiteCoordinates])

    sitesToMakeMarkersFor.forEach((siteToMakeMarkerFor) => {
      const sitePosition = toLeaflet(siteToMakeMarkerFor.coordinate)

      // add site marker
      markers.push(
        <Marker
          key={`site-marker-${siteToMakeMarkerFor._id}`}
          position={sitePosition}
          zIndexOffset={9000}
        />
      )

      bounds.extend(sitePosition)
    })

    // add all commuters to site
    commuters.forEach((commuter) => {
      if (commuter.coordinate.lat === 0) return  // don't include commuters not geocoded yet
      const commuterPosition = toLeaflet(commuter.coordinate)
      markers.push(
        <Marker
          icon={homeIcon}
          key={`commuter-marker-${commuter._id}`}
          position={commuterPosition}
          zIndexOffset={1234}
          />
      )
      bounds.extend(commuterPosition)
    })

    // return only site marker if no commuters or commuters haven't loaded yet
    if (markers.length === 1) {
      return {
        markers,
        position: firstSiteCoordinates,
        zoom: 11
      }
    }

    return {
      bounds,
      markers
    }
  }

  _onDeleteCommuterClick (commuter) {
    const doDelete = () => this.props.deleteCommuter(commuter)
    actUponConfirmation(messages.commuter.deleteConfirmation, doDelete)
  }

  render () {
    const {commuters, isMultiSite, polygonStore, multiSite, site, sites} = this.props
    const {activeTab, analysisMode, isochroneColoring} = this.state

    /************************************************************************
     map stuff
    ************************************************************************/
    const {bounds, markers, position, zoom} = this._mapSitesAndCommuters()
    const isochrones = []
    if (!isMultiSite &&
      activeTab === 'analysis' &&
      site.calculationStatus === 'successfully') {
      // travel times calculated successfully
      const curIsochrones = Object.values(polygonStore).filter((polygon) =>
        polygon.mode === analysisMode && polygon.siteId === site._id
      )
      curIsochrones.forEach((isochrone) => {
        const geojsonProps = {
          data: Object.assign(isochrone, { type: 'Feature' }),
          key: `isochrone-${analysisMode}-${isochrone.properties.time}`,
          onEachFeature,
          stroke: false,
          fillOpacity: 0.4
        }

        if (isochroneColoring) {
          geojsonProps.style = styleIsochrone
        }

        isochrones.push(
          <GeoJSON {...geojsonProps} />
        )
      })
    }

    /************************************************************************
     commuter tab stuff
    ************************************************************************/
    const hasCommuters = commuters.length > 0
    const pctGeocoded = Math.round(100 * commuters.reduce((accumulator, commuter) => {
      return accumulator + (commuter.geocodeConfidence !== -1 ? 1 : 0)
    }, 0) / commuters.length)
    const pctStatsCalculated = Math.round(100 * commuters.reduce((accumulator, commuter) => {
      return accumulator + (commuter.modeStats ? 1 : 0)
    }, 0) / commuters.length)
    const allCommutersGeocoded = pctGeocoded === 100
    let createCommuterButtons
    if (!isMultiSite) {
      createCommuterButtons = (
        <ButtonGroup>
          <ButtonLink
            bsStyle='info'
            to={`/site/${site._id}/commuter/create`}
            >
            Create New Commuter
          </ButtonLink>
          <ButtonLink
            bsStyle='success'
            to={`/site/${site._id}/bulk-add-commuters`}
            >
            Bulk Add Commuters
          </ButtonLink>
        </ButtonGroup>
      )
    }

    /************************************************************************
     analysis tab stuff
    ************************************************************************/
    const analysisModeStatsLookup = {}
    commuters.forEach((commuter) => {
      let travelTime
      if (commuter.modeStats) {
        travelTime = commuter.modeStats[analysisMode].travelTime
      } else {
        travelTime = 'calculating...'
      }
      // convert unreachable to high value for sorting purposes
      if (travelTime === -1) {
        travelTime = 9999
      }
      if (!analysisModeStatsLookup[travelTime]) {
        analysisModeStatsLookup[travelTime] = 0
      }
      analysisModeStatsLookup[travelTime]++
    })

    let cumulative = 0
    const analysisModeStats = Object.keys(analysisModeStatsLookup)
      .sort((a, b) => a - b)
      .map((range) => {
        const minutes = range / 60
        const num = analysisModeStatsLookup[range]
        cumulative += num
        return {
          bin: (range < 9999
            ? `${minutes - 5} - ${minutes}`
            : (range === 'calculating...' ? range : 'N/A')
          ),
          num,
          cumulative: cumulative + 0
        }
      })

    /************************************************************************
     ridematches tab stuff
    ************************************************************************/
    // TODO: should probably move this computation to a reducer to avoid recalculating on each render
    // only do this if all commuters are geocoded
    let ridematchingAggregateTable = []
    if (allCommutersGeocoded) {
      const matches = []
      for (let i = 0; i < commuters.length; i++) {
        const commuterA = commuters[i]
        const commuterAcoordinates = toCoordinates(commuterA.coordinate)
        for (let j = i + 1; j < commuters.length; j++) {
          const commuterB = commuters[j]
          const commuterBcoordinates = toCoordinates(commuterB.coordinate)
          const distanceBetweenCommuters = distance(commuterAcoordinates, commuterBcoordinates, 'miles')
          if (distanceBetweenCommuters <= 5) {
            matches.push({
              commuterA,
              commuterB,
              distanceBetweenCommuters
            })
          }
        }
      }

      const ridematchingBins = {
        '0 - 0.25': {
          cumulative: 0,
          maxDistance: 0.25,
          num: 0
        },
        '0.25 - 0.5': {
          cumulative: 0,
          maxDistance: 0.5,
          num: 0
        },
        '0.5 - 1': {
          cumulative: 0,
          maxDistance: 1,
          num: 0
        },
        '1 - 2': {
          cumulative: 0,
          maxDistance: 2,
          num: 0
        },
        '2 - 5': {
          cumulative: 0,
          maxDistance: 5,
          num: 0
        },
        'N/A': {}
      }
      const ridematchingBinsArray = Object.keys(ridematchingBins)
      let curBinIdx = 0
      const commutersWithRidematches = {}
      let commutersInCurrentBin = {}
      matches.sort((a, b) => a.distanceBetweenCommuters - b.distanceBetweenCommuters)
        .forEach((match) => {
          // determine current bin
          while (match.distanceBetweenCommuters > (
            ridematchingBins[ridematchingBinsArray[curBinIdx]].maxDistance
          )) {
            curBinIdx++
            ridematchingBins[ridematchingBinsArray[curBinIdx]].cumulative = (
              ridematchingBins[ridematchingBinsArray[curBinIdx - 1]].cumulative
            )
            commutersInCurrentBin = {}
          }

          const binData = ridematchingBins[ridematchingBinsArray[curBinIdx]]

          if (!commutersInCurrentBin[match.commuterA._id]) {
            // first time seeing commuterA in this range, add to total for bin
            binData.num += 1
            commutersInCurrentBin[match.commuterA._id] = true
          }

          if (!commutersInCurrentBin[match.commuterB._id]) {
            // first time seeing commuterB in this range, add to total for bin
            binData.num += 1
            commutersInCurrentBin[match.commuterB._id] = true
          }

          if (!commutersWithRidematches[match.commuterA._id]) {
            // first time seeing commuterA in all matches, add to cumulative total
            binData.cumulative += 1
            commutersWithRidematches[match.commuterA._id] = true
          }

          if (!commutersWithRidematches[match.commuterB._id]) {
            // first time seeing commuterB in all matches, add to cumulative total
            binData.cumulative += 1
            commutersWithRidematches[match.commuterB._id] = true
          }
        })

      // set cumulative of remaining bins (except last)
      while (curBinIdx < ridematchingBinsArray.length - 1) {
        curBinIdx++
        ridematchingBins[ridematchingBinsArray[curBinIdx]].cumulative = (
          ridematchingBins[ridematchingBinsArray[curBinIdx - 1]].cumulative
        )
      }

      // calculate num commuters without ridematch options
      ridematchingBins['N/A'].num = (
        commuters.length - ridematchingBins[ridematchingBinsArray[ridematchingBinsArray.length - 2]].cumulative
      )
      ridematchingBins['N/A'].cumulative = commuters.length

      ridematchingAggregateTable = ridematchingBinsArray.map((bin) => (
        Object.assign({ bin }, ridematchingBins[bin])
      ))
    }

    return (
      <Grid>
        <Row>
          {/***************************
            Header
          ***************************/}
          <Col xs={12}>
            <h3>
              <span>{isMultiSite ? multiSite.name : site.name}</span>
              <BackButton />
            </h3>
            {!isMultiSite &&
              <p>{site.address}</p>
            }
            <ButtonGroup>
              <ButtonLink
                bsStyle='warning'
                to={`/${isMultiSite ? 'multi-site' : 'site'}/${isMultiSite ? multiSite._id : site._id}/edit`}
                >
                Edit
              </ButtonLink>
              <Button
                bsStyle='danger'
                onClick={this._handleDelete}
                >
                Delete
              </Button>
            </ButtonGroup>
          </Col>
          {/***************************
            Map
          ***************************/}
          <Col xs={12} style={{height: '400px', marginTop: '1em', marginBottom: '1em'}}>
            <LeafletMap center={position} bounds={bounds} zoom={zoom}>
              <TileLayer
                url={Browser.retina &&
                  process.env.LEAFLET_RETINA_URL
                  ? process.env.LEAFLET_RETINA_URL
                  : process.env.LEAFLET_TILE_URL}
                attribution={process.env.LEAFLET_ATTRIBUTION}
                />
              {markers}
              {isochrones}
            </LeafletMap>
          </Col>
          {/***************************
            Content
          ***************************/}
          {!hasCommuters &&
            <Col xs={12}>
              {isMultiSite &&
                <p>None of the sites in this Multi-Site Analysis have any commuters!  Add commuters to individual sites.</p>
              }
              {!isMultiSite &&
                <div>
                  <p>This site doesn't have any commuters yet!  Add some using one of the options below:</p>
                  {createCommuterButtons}
                </div>
              }
            </Col>
          }
          {hasCommuters &&
            <Tabs
              activeKey={activeTab}
              id='site-tabs'
              onSelect={this._handleTabSelect}
              >
              {isMultiSite &&
                <Tab eventKey='sites' title='Sites'>
                  {/***************************
                    Sites Tab
                  ***************************/}
                  <Row>
                    <Col xs={12}>
                      <BootstrapTable data={sites}>
                        <TableHeaderColumn dataField='_id' isKey hidden />
                        <TableHeaderColumn dataField='name'>Name</TableHeaderColumn>
                        <TableHeaderColumn dataField='address'>Address</TableHeaderColumn>
                        <TableHeaderColumn
                          dataField='commuters'
                          dataFormat={arrayCountRenderer}
                          >
                          # of Commuters
                        </TableHeaderColumn>
                      </BootstrapTable>
                    </Col>
                  </Row>
                </Tab>
              }
              <Tab eventKey='commuters' title='Commuters'>
                {/***************************
                  Commuters Tab
                ***************************/}
                <Row>
                  <Col xs={12}>
                    {!isMultiSite && createCommuterButtons}
                    {!isMultiSite &&
                      <span className='pull-right'>
                        <Table condensed bordered>
                          <tbody>
                            <tr>
                              <td>% of commuters geocoded:</td>
                              <td>{pctGeocoded}</td>
                            </tr>
                            <tr>
                              <td>% of commutes calculated:</td>
                              <td>{pctStatsCalculated}</td>
                            </tr>
                          </tbody>
                        </Table>
                      </span>
                    }
                    {isMultiSite &&
                      <span className='pull-right'>
                        <Table condensed bordered>
                          <tbody>
                            <tr>
                              <td>% of commuters geocoded:</td>
                              <td>{pctGeocoded}</td>
                              <td>% of commutes calculated:</td>
                              <td>{pctStatsCalculated}</td>
                            </tr>
                          </tbody>
                        </Table>
                      </span>
                    }
                    <div style={{ clear: 'both' }}>
                      {isMultiSite &&
                        <BootstrapTable data={commuters}>
                          <TableHeaderColumn dataField='_id' isKey hidden />
                          <TableHeaderColumn dataField='name'>Name</TableHeaderColumn>
                          <TableHeaderColumn dataField='address'>Address</TableHeaderColumn>
                          <TableHeaderColumn dataFormat={this._commuterSiteNameRenderer}>Site</TableHeaderColumn>
                        </BootstrapTable>
                      }
                      {!isMultiSite &&
                        <BootstrapTable data={commuters}>
                          <TableHeaderColumn dataField='_id' isKey hidden />
                          <TableHeaderColumn dataField='name'>Name</TableHeaderColumn>
                          <TableHeaderColumn dataField='address'>Address</TableHeaderColumn>
                          <TableHeaderColumn dataFormat={geocodeConfidenceRenderer}>Geocode Confidence</TableHeaderColumn>
                          <TableHeaderColumn dataFormat={this._commuterToolsRenderer}>Tools</TableHeaderColumn>
                        </BootstrapTable>
                      }
                    </div>
                  </Col>
                </Row>
              </Tab>
              <Tab eventKey='analysis' title='Analysis'>
                {/***************************
                  Analysis Tab
                ***************************/}
                <FieldGroup
                  label='Mode'
                  name='mode'
                  onChange={this._handleAnalysisModeChange}
                  componentClass='select'
                  value={analysisMode}
                  >
                  <option value='TRANSIT'>Transit</option>
                  <option value='BICYCLE'>Bicycle</option>
                  <option value='WALK'>Walk</option>
                  <option value='CAR'>Car</option>
                </FieldGroup>
                <BootstrapTable data={analysisModeStats}>
                  <TableHeaderColumn dataField='bin' isKey>Time in Minutes</TableHeaderColumn>
                  <TableHeaderColumn dataField='num'>Number in Range</TableHeaderColumn>
                  <TableHeaderColumn dataField='cumulative'>Cumulative Number</TableHeaderColumn>
                </BootstrapTable>
              </Tab>
              <Tab eventKey='ridematches' title='Ridematches'>
                {/***************************
                  Ridematches Tab
                ***************************/}
                {!allCommutersGeocoded &&
                  <ProgressBar
                    striped
                    now={pctGeocoded}
                    label='Geocoding Commuters'
                    />
                }
                {allCommutersGeocoded &&
                  <div>
                    <BootstrapTable data={ridematchingAggregateTable}>
                      <TableHeaderColumn dataField='bin' isKey>Ridematch radius in miles</TableHeaderColumn>
                      <TableHeaderColumn dataField='num'>Number in Range</TableHeaderColumn>
                      <TableHeaderColumn dataField='cumulative'>Cumulative Number</TableHeaderColumn>
                    </BootstrapTable>
                  </div>
                }
              </Tab>
            </Tabs>
          }
        </Row>
      </Grid>
    )
  }
}

function geocodeConfidenceRenderer (cell, row) {
  const {geocodeConfidence} = row
  if (geocodeConfidence === -1) {
    return 'calculating...'
  } else if (geocodeConfidence >= 0.8) {
    return 'Good'
  } else {
    return 'Not exact'
  }
}

const homeIcon = icon({
  iconUrl: `${process.env.STATIC_HOST}assets/home-2.png`,
  iconSize: [32, 37],
  iconAnchor: [22, 37]
})

function onEachFeature (feature, layer) {
  if (feature.properties) {
    let pop = '<p>'
    Object.keys(feature.properties).forEach((name) => {
      pop += name.toUpperCase()
      pop += ': '
      pop += feature.properties[name]
      pop += '<br />'
    })
    pop += '</p>'
    layer.bindPopup(pop)
  }
}

function styleIsochrone (feature) {
  return {
    fillColor: hslToHex(feature.properties.time * -0.017391304347826 + 125.217391304348, 100, 50)
  }
}
