import React, {Component, PropTypes} from 'react'
import {Button, ButtonGroup, Col, Grid, Row} from 'react-bootstrap'
import {BootstrapTable, TableHeaderColumn} from 'react-bootstrap-table'
import {Link} from 'react-router'

import Icon from './icon'
import {messages} from '../utils/env'
import {arrayCountRenderer} from '../utils/table'
import {actUponConfirmation} from '../utils/ui'

export default class Organizations extends Component {
  static propTypes = {
    // dispatch
    deleteAgency: PropTypes.func.isRequired,
    deleteOrganization: PropTypes.func.isRequired,
    loadOrganizations: PropTypes.func.isRequired,

    // props
    agency: PropTypes.object.isRequired,
    organizations: PropTypes.array.isRequired
  }

  componentWillMount () {
    this.props.loadOrganizations({ agencyId: this.props.agency._id })
  }

  _handleDelete = () => {
    const doDelete = () => this.props.deleteAgency(this.props.agency)
    actUponConfirmation(messages.agency.deleteConfirmation, doDelete)
  }

  _onDeleteOrganizationClick (organization) {
    const doDelete = () => this.props.deleteOrganization(organization)
    actUponConfirmation(messages.organization.deleteConfirmation, doDelete)
  }

  _toolsRenderer = (cell, row) => {
    return <div>
      <Button bsStyle='warning'>
        <Link to={`/organization/${row._id}/edit`}>Edit</Link>
      </Button>
      <Button bsStyle='danger' onClick={this._onDeleteOrganizationClick.bind(this, row)}>Delete</Button>
    </div>
  }

  render () {
    const {_id: agencyId, name} = this.props.agency
    const {organizations} = this.props
    return (
      <Grid>
        <Row>
          <Col xs={12}>
            <h2>
              <Icon type='flag' />
              <span>{name}</span>
            </h2>
            <ButtonGroup>
              <Button bsStyle='warning'>
                <Link to={`/agency/${agencyId}/edit`}>Edit</Link>
              </Button>
              <Button bsStyle='danger' onClick={this._handleDelete}>Delete</Button>
            </ButtonGroup>
            <h3>Organizations
              <Button className='pull-right'>
                <Link to={`/agency/${agencyId}/organization/create`}>
                  <span>Create a new organization</span>
                  <Icon type='shield' />
                </Link>
              </Button>
            </h3>
            <p>An organization is a collection of sites <Icon type='building' /> and commuters <Icon type='users' />.</p>
            <BootstrapTable data={organizations}>
              <TableHeaderColumn dataField='_id' isKey hidden />
              <TableHeaderColumn dataField='name' dataFormat={nameRenderer}>Name</TableHeaderColumn>
              <TableHeaderColumn dataField='sites' dataFormat={arrayCountRenderer}>Sites</TableHeaderColumn>
              <TableHeaderColumn dataField='groups' dataFormat={arrayCountRenderer}>Groups</TableHeaderColumn>
              <TableHeaderColumn dataField='analyses' dataFormat={arrayCountRenderer}>Analyses</TableHeaderColumn>
              <TableHeaderColumn dataFormat={this._toolsRenderer}>Tools</TableHeaderColumn>
            </BootstrapTable>
          </Col>
        </Row>
      </Grid>
    )
  }
}

function nameRenderer (cell, row) {
  return <Link to={`/organization/${row._id}`}>{cell}</Link>
}
