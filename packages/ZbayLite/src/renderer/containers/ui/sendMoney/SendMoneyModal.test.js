/* eslint import/first: 0 */
import Immutable from 'immutable'
import { mapStateToProps } from './SendMoneyModal'

import create from '../../../store/create'

describe('SendMoneyModal', () => {
  let store = null
  beforeEach(() => {
    jest.clearAllMocks()
    store = create({
      initialState: Immutable.Map({
        rates: Immutable.Map({
          usd: '10',
          zec: '1'
        }),
        identity: {
          data: {
            id: '1',
            address: 'test',
            name: 'Mars',
            balance: '2'
          }
        }
      })
    })
  })
  it('will receive right props', async () => {
    const props = mapStateToProps(store.getState())
    expect(props).toMatchSnapshot()
  })
})
