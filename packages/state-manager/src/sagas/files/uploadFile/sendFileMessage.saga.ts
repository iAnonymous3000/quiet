import { type PayloadAction } from '@reduxjs/toolkit'
import { select, call, put } from 'typed-redux-saga'
import { identitySelectors } from '../../identity/identity.selectors'
import { filesActions } from '../files.slice'
import { messagesActions } from '../../messages/messages.slice'
import { generateMessageId } from '../../messages/utils/message.utils'
import { publicChannelsSelectors } from '../../publicChannels/publicChannels.selectors'
import { DownloadState, type FileMetadata, imagesExtensions, MessageType } from '@quiet/types'
import { loggingHandler, LoggerModuleName } from '../../../utils/logger'

const LOGGER = loggingHandler.initLogger([LoggerModuleName.FILES, LoggerModuleName.SAGA, 'sendFileMessage'])

export function* sendFileMessageSaga(
  action: PayloadAction<ReturnType<typeof filesActions.uploadFile>['payload']>
): Generator {
  const identity = yield* select(identitySelectors.currentIdentity)

  const currentChannel = yield* select(publicChannelsSelectors.currentChannelId)
  if (!identity) {
    LOGGER.warn(`No identity found, can't send file`)
    return
  }

  if (!currentChannel) {
    LOGGER.warn(`No current channel found, can't send file`)
    return
  }

  const fileProtocol = 'file://'
  let filePath = action.payload.path
  let tmpPath = action.payload.tmpPath
  if (!filePath) return
  try {
    filePath = decodeURIComponent(filePath.startsWith(fileProtocol) ? filePath.slice(fileProtocol.length) : filePath)
    tmpPath = tmpPath ? decodeURIComponent(tmpPath.slice(fileProtocol.length)) : undefined
  } catch (e) {
    LOGGER.error(`Can't send file with path ${filePath}, Details: ${e.message}`)
    return
  }

  const id = yield* call(generateMessageId)

  const media: FileMetadata = {
    ...action.payload,
    path: filePath,
    tmpPath: tmpPath,
    cid: `uploading_${id}`,
    message: {
      id,
      channelId: currentChannel,
    },
  }

  let type: MessageType

  if (imagesExtensions.includes(media.ext)) {
    type = MessageType.Image
  } else {
    type = MessageType.File
  }

  yield* put(
    messagesActions.sendMessage({
      id,
      message: '',
      type,
      media,
    })
  )

  yield* put(
    filesActions.updateDownloadStatus({
      mid: id,
      cid: `uploading_${id}`,
      downloadState: DownloadState.Uploading,
      downloadProgress: undefined,
    })
  )
}
