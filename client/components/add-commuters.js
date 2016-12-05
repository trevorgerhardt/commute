/* globals FileReader */

import {csvParse} from 'd3-dsv'
import omit from 'lodash.omit'
import React, {Component, PropTypes} from 'react'
import {Accordion, Button, Col, Grid, Panel, Row} from 'react-bootstrap'
import {BootstrapTable, TableHeaderColumn} from 'react-bootstrap-table'
import Dropzone from 'react-dropzone'
import {Link} from 'react-router'
import uuid from 'uuid'

import FieldGroup from './fieldgroup'
import Icon from './icon'

export default class AddCommuters extends Component {
  static propTypes = {
    // dispatch
    createCommuter: PropTypes.func.isRequired,
    createGroup: PropTypes.func.isRequired,

    // props
    appendMode: PropTypes.bool,
    existingCommuters: PropTypes.array,
    group: PropTypes.object,
    organizationId: PropTypes.string
  }

  componentWillMount () {
    if (this.props.appendMode) {
      this.setState({
        name: this.props.group.name,
        existingCommuters: this.props.existingCommuters
      })
    } else {
      this.state = {
        organizationId: this.props.organizationId
      }
    }
  }

  handleChange = (name, event) => {
    this.setState({ [name]: event.target.value })
  }

  handleSubmit = () => {
    const {appendMode, createCommuter, createGroup} = this.props
    const commutersToCreate = this.state.newCommuters
      ? this.state.newCommuters.map((commuter) => omit(commuter, '_id'))
      : []

    if (appendMode) {
      createCommuter(commutersToCreate)
    } else {
      const newGroup = {...this.state}
      newGroup.commuters = commutersToCreate
      delete newGroup.newCommuters
      createGroup(newGroup)
    }
  }

  onDrop = (files) => {
    const {appendMode, group} = this.props
    const r = new FileReader()

    r.onload = (e) => {
      const newCommuters = csvParse(e.target.result, (row) => {
        const {address, email, name} = row
        const _id = row._id || uuid.v4()
        // TODO: parse more field possibilities (first name, last name, etc)
        const newCommuter = {address, email, _id, name}
        if (appendMode) {
          newCommuter.groupId = group._id
        }
        return newCommuter
      })

      this.setState({newCommuters})
    }

    // TODO: handle multiple files
    r.readAsText(files[0])
  }

  render () {
    const {appendMode, group, organizationId} = this.props
    const groupName = this.state.name
    const showAccordion = !!(this.state.existingCommuters || this.state.newCommuters)
    return (
      <Grid>
        <Row>
          <Col xs={12}>
            <h3>
              <span>{appendMode ? 'Add Commuters to Group' : 'Create Commuter Group'}</span>
              <Button className='pull-right'>
                <Link to={appendMode ? `/group/${group._id}` : `/organization/${organizationId}`}>
                  <Icon type='arrow-left' />
                  <span>Back</span>
                </Link>
              </Button>
            </h3>
            <form>
              <FieldGroup
                label='Name'
                name='name'
                onChange={this.handleChange}
                placeholder='Enter name'
                type='text'
                value={groupName}
                />
              <Dropzone
                accept='text/csv'
                className='dropzone'
                multiple={false}
                onDrop={this.onDrop}
                >
                <div>Try dropping a csv file here, or click to select files to upload.  Make sure the csv file contains the headers: name, email and address.</div>
              </Dropzone>
              {showAccordion &&
                <Accordion>
                  {!!(this.state.existingCommuters) &&
                    <Panel
                      header={`${this.state.existingCommuters.length} Existing Commuters`}
                      bsStyle='info'
                      eventKey='1'
                      >
                      {makeCommuterTable(this.state.existingCommuters)}
                    </Panel>
                  }
                  {!!(this.state.newCommuters) &&
                    <Panel
                      header={`${this.state.newCommuters.length} New Commuters`}
                      bsStyle='success'
                      eventKey='2'
                      >
                      {makeCommuterTable(this.state.newCommuters)}
                    </Panel>
                  }
                </Accordion>
              }
              <Button
                bsStyle='success'
                onClick={this.handleSubmit}
                >
                {appendMode ? 'Append' : 'Create'}
              </Button>
            </form>
          </Col>
        </Row>
      </Grid>
    )
  }
}

function makeCommuterTable (commuters) {
  return (
    <BootstrapTable data={commuters}>
      <TableHeaderColumn dataField='_id' isKey hidden />
      <TableHeaderColumn dataField='name'>Name</TableHeaderColumn>
      <TableHeaderColumn dataField='email'>Email</TableHeaderColumn>
      <TableHeaderColumn dataField='address'>Address</TableHeaderColumn>
    </BootstrapTable>
  )
}
