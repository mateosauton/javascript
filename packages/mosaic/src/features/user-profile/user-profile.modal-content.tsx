import { useUser } from '@clerk/shared/react';
import React from 'react';

import { UserProfileSurface } from '../profile/profile';
import type { UserProfileModalContentProps } from './user-profile.modal.types';

export default function UserProfileModalContent({ options, close }: UserProfileModalContentProps): React.ReactElement {
  const { isLoaded, user } = useUser();
  const signedOut = isLoaded && !user;

  React.useEffect(() => {
    if (signedOut) {
      close();
    }
  }, [signedOut, close]);

  const { page, combined = true, ...props } = options ?? {};
  return (
    <UserProfileSurface
      {...props}
      combined={combined}
      presentation='modal'
      defaultPage={page}
    />
  );
}
