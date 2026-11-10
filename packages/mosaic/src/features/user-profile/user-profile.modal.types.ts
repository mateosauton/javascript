import type { ModalContentProps } from '../../modals/modal.types';
import type { CombinedProfileProps } from '../profile/profile';

export interface UserProfileModalOptions extends Pick<
  CombinedProfileProps,
  'customPages' | 'pageOrder' | 'additionalOAuthScopes' | 'apiKeysProps' | 'organizationProfileProps'
> {
  combined?: boolean;
  page?: CombinedProfileProps['defaultPage'];
}

export type UserProfileModalContentProps = ModalContentProps<UserProfileModalOptions>;
