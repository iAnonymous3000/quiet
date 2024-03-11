/* eslint-disable padded-blocks */
import React, { FC, useCallback, useEffect, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { identity, communities } from '@quiet/state-manager'
import {
  CommunityOwnership,
  CreateNetworkPayload,
  InvitationData,
  InvitationDataVersion,
  InvitationPair,
} from '@quiet/types'
import { JoinCommunity } from '../../components/JoinCommunity/JoinCommunity.component'
import { navigationActions } from '../../store/navigation/navigation.slice'
import { ScreenNames } from '../../const/ScreenNames.enum'
import { JoinCommunityScreenProps } from './JoinCommunity.types'
import { initSelectors } from '../../store/init/init.selectors'

export const JoinCommunityScreen: FC<JoinCommunityScreenProps> = ({ route }) => {
  const dispatch = useDispatch()

  const [invitationCode, setInvitationCode] = useState<string | undefined>(undefined)

  const isWebsocketConnected = useSelector(initSelectors.isWebsocketConnected)

  const currentCommunity = useSelector(communities.selectors.currentCommunity)
  const currentIdentity = useSelector(identity.selectors.currentIdentity)

  const networkCreated = Boolean(currentCommunity && !currentIdentity?.userCertificate)

  const community = useSelector(communities.selectors.currentCommunity)

  // Handle deep linking (opening app with quiet://)
  useEffect(() => {
    const code = route.params?.code

    // Screen hasn't been open through a link
    if (!code) return

    // Change component state
    setInvitationCode(code)
  }, [dispatch, community, route.params?.code])

  const joinCommunityAction = useCallback(
    (data: InvitationData) => {
      // TODO: refactor or move to a saga
      if (!data.version) data.version = InvitationDataVersion.v1
      switch (data.version) {
        case InvitationDataVersion.v1:
          const payload: CreateNetworkPayload = {
            ownership: CommunityOwnership.User,
            peers: data.pairs,
            psk: data.psk,
            ownerOrbitDbIdentity: data.ownerOrbitDbIdentity,
          }
          dispatch(communities.actions.createNetwork(payload))
          dispatch(
            navigationActions.navigation({
              screen: ScreenNames.UsernameRegistrationScreen,
            })
          )
          break
      }
    },
    [dispatch]
  )

  const redirectionAction = useCallback(() => {
    dispatch(
      navigationActions.navigation({
        screen: ScreenNames.CreateCommunityScreen,
      })
    )
  }, [dispatch])

  return (
    <JoinCommunity
      joinCommunityAction={joinCommunityAction}
      redirectionAction={redirectionAction}
      networkCreated={networkCreated}
      invitationCode={invitationCode}
      ready={isWebsocketConnected}
    />
  )
}
