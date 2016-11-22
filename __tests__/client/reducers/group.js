/* globals describe, expect, it */

import {handleActions} from 'redux-actions'

import {commuterSal, mockGroupCreation, mockStores} from '../../test-utils/mock-data'
import {makeChildrenHandlerTestCases, makeGenericReducerTestCases} from '../../test-utils/reducers'

import * as group from '../../../client/reducers/group'

describe('client > reducers > group', () => {
  const anotherGroup = { id: 'group-3', name: 'Another Group', commuters: [] }

  makeChildrenHandlerTestCases({
    add: {
      affectedParentId: 'group-2',
      initialState: mockStores.withAnalysisRun.group,
      payload: { id: 'commuter-new', groupId: 'group-2' }
    },
    childPluralName: 'commuters',
    childSingularName: 'commuter',
    delete: {
      affectedParentId: 'group-2',
      initialState: mockStores.withAnalysisRun.group,
      payload: { id: 'commuter-2', groupId: 'group-2' }
    },
    initialState: group.initialState,
    reducers: group.reducers
  })

  makeGenericReducerTestCases({
    handlers: {
      delete: {
        initialState: mockStores.withAnalysisRun.group,
        payload: 'group-2'
      },
      set: {
        initialState: mockStores.withBlankOrganization.group,
        payload: anotherGroup
      },
      'set all': {
        initialState: group.initialState,
        payload: [anotherGroup]
      }
    },
    initialState: group.initialState,
    name: {
      plural: 'groups',
      singular: 'group'
    },
    reducers: group.reducers
  })

  it('should handle add group', () => {
    const reducer = handleActions(group.reducers, group.initialState)
    const newGroup = {...mockGroupCreation}
    newGroup.id = 'new-group'
    newGroup.commuters[0].groupId = 'new-group'
    const action = { payload: newGroup, type: 'add group' }
    const result = reducer(mockStores.withBlankOrganization.group, action)
    expect(result['new-group'].name).toEqual('Fake Group')
    expect(result).toMatchSnapshot()
  })

  it('should handle append commuters', () => {
    const reducer = handleActions(group.reducers, group.initialState)
    const action = {
      type: 'append commuters',
      payload: {
        groupId: 'group-2',
        commuters: [commuterSal]
      }
    }
    const result = reducer(mockStores.withAnalysisRun.group, action)
    expect(result['group-2'].commuters.length).toBe(2)
    expect(result).toMatchSnapshot()
  })
})
