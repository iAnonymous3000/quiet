
import React from 'react'
import { storiesOf } from '@storybook/react-native'

import { useContextMenu } from '../../hooks/useContextMenu'

import { Appbar } from './Appbar.component'

const contextMenu: ReturnType<typeof useContextMenu> = {
  visible: false,
  handleOpen: undefined,
  handleClose: undefined
}

storiesOf('Appbar', module)
  .add('Channel', () => <Appbar title={'general'} prefix={'#'} back={() => { console.log('back') }} />)
  .add('Community', () => <Appbar title={'Quiet'} position={'flex-start'} contextMenu={contextMenu} />)