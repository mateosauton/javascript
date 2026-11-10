'use client';

import type { ReactNode } from 'react';

import type { APIKeysPageProps } from '../api-keys/api-keys-table';
import type { OrganizationProfileProps } from '../organization-profile/organization-profile';
import { organizationProfilePageIds } from '../organization-profile/organization-profile.layout';
import { useOrganizationProfileModel } from '../organization-profile/organization-profile.model';
import { OrganizationProfileProvider } from '../organization-profile/organization-profile.provider';
import type {
  OrganizationProfilePageId,
  OrganizationProfilePages,
} from '../organization-profile/organization-profile.types';
import { OrganizationProfileView } from '../organization-profile/organization-profile.view';
import { OrganizationProfileApiKeysPanel } from '../organization-profile/organization-profile-api-keys-panel';
import { OrganizationProfileGeneralPanel } from '../organization-profile/organization-profile-general-panel';
import { OrganizationProfileMembersPanel } from '../organization-profile/organization-profile-members-panel/organization-profile-members-panel';
import { useProfilePagesController } from '../profile-pages/profile-pages.controller';
import { useMosaicProfile } from '../profile-pages/use-mosaic-profile';
import { useUserProfilePages } from '../switcher/switcher.pages';
import type { UserProfileProps } from '../user-profile/user-profile';
import { ORGANIZATION_PAGE_PREFIX, userProfilePageIds } from '../user-profile/user-profile.layout';
import type { UserProfileOptions } from '../user-profile/user-profile.provider';
import { UserProfileProvider } from '../user-profile/user-profile.provider';
import type { UserProfileViewProps } from '../user-profile/user-profile.view';
import { UserProfileView } from '../user-profile/user-profile.view';
import { UserProfileApiKeysPanel } from '../user-profile/user-profile-api-keys-panel';
import { UserProfileProfilePanel } from '../user-profile/user-profile-profile-panel';
import { UserProfileSecurityPanel } from '../user-profile/user-profile-security-panel';
import { useUserProfileUserModel } from '../user-profile/user-profile-user.model';

/** Which pages the profile carries: the account's and the active organization's, or one of them alone. */
export type ProfileMode = 'combined' | 'user' | 'organization';

/** Everything `<Profile />` takes in `combined` mode. */
export interface CombinedProfileProps extends UserProfileProps {
  /**
   * Options for the organization's pages: your own pages and their order, the API keys page, and
   * where leaving the organization lands. `pageOrder` names the organization's pages without the
   * `organization/` prefix, as in `['members', 'general']`.
   */
  organizationProfileProps?: Pick<
    OrganizationProfileProps,
    'customPages' | 'pageOrder' | 'apiKeysProps' | 'afterLeaveOrganizationUrl'
  >;
}

/**
 * Everything `<Profile />` takes. Each mode takes its own options: `combined` the account's with the
 * organization's in `organizationProfileProps`, `user` the account's, and `organization` the
 * organization's. A mode chosen at runtime takes any mode's options, and the ones its mode has no use for do nothing.
 */
export type ProfileProps =
  | ({ mode?: 'combined' } & CombinedProfileProps)
  | ({ mode: 'user' } & UserProfileProps)
  | ({ mode: 'organization' } & OrganizationProfileProps);

/**
 * The signed-in user's profile. `combined` lists the account's pages and then the active
 * organization's, `user` the account's alone, and `organization` the active organization's alone.
 * Without a `mode`, it follows `MosaicProvider`'s `profile.combined`: `false` shows the account's
 * pages alone. It reads from Clerk, so it takes no data. It renders `fallback` until Clerk answers,
 * and nothing at all when there is nothing to show.
 *
 * @example
 * ```tsx
 * <Profile />
 * ```
 *
 * @example
 * `mode` narrows the profile. `<UserProfile />` and `<OrganizationProfile />` are the same as
 * `mode='user'` and `mode='organization'`.
 * ```tsx
 * <Profile mode='user' />
 * <Profile mode='organization' afterLeaveOrganizationUrl='/organizations' />
 * ```
 *
 * @example
 * `defaultPage` picks the page the profile opens on without moving it in the navigation. An
 * organization page's id is prefixed with `organization/` in `combined` mode.
 * ```tsx
 * <Profile defaultPage='organization/members' />
 * ```
 *
 * @example
 * `organizationProfileProps` adds your own pages to the organization's group.
 * ```tsx
 * <Profile
 *   organizationProfileProps={{
 *     customPages: [{ path: 'audit', label: 'Audit log', icon: <ListIcon />, content: <AuditPage /> }],
 *   }}
 * />
 * ```
 */
export function Profile(props: ProfileProps): ReactNode {
  const provider = useMosaicProfile();

  if (props.mode === 'organization') {
    return <OrganizationProfileSurface {...withOrganizationDefaults(props, provider.organizationProfileProps)} />;
  }

  const { mode = provider.combined === false ? 'user' : 'combined', ...ownProps } = props;
  const userProps = withUserDefaults(ownProps, provider.userProfileProps);

  if (mode === 'user') {
    return (
      <UserProfileSurface
        {...userProps}
        presentation='mounted'
        combined={false}
      />
    );
  }

  return (
    <UserProfileSurface
      {...userProps}
      organizationProfileProps={withOrganizationDefaults(
        ('organizationProfileProps' in ownProps ? ownProps.organizationProfileProps : undefined) ?? {},
        provider.organizationProfileProps,
      )}
      presentation='mounted'
      combined
    />
  );
}

function withUserDefaults(
  props: UserProfileProps,
  defaults: Pick<UserProfileProps, 'customPages' | 'pageOrder' | 'additionalOAuthScopes' | 'apiKeysProps'> = {},
): UserProfileProps {
  const {
    customPages = defaults.customPages,
    pageOrder = defaults.pageOrder,
    additionalOAuthScopes = defaults.additionalOAuthScopes,
    apiKeysProps = defaults.apiKeysProps,
    defaultPage,
    fallback,
  } = props;
  return { customPages, pageOrder, additionalOAuthScopes, apiKeysProps, defaultPage, fallback };
}

function withOrganizationDefaults<Props extends NonNullable<CombinedProfileProps['organizationProfileProps']>>(
  props: Props,
  defaults: NonNullable<CombinedProfileProps['organizationProfileProps']> = {},
): Props {
  const {
    customPages = defaults.customPages,
    pageOrder = defaults.pageOrder,
    apiKeysProps = defaults.apiKeysProps,
    afterLeaveOrganizationUrl = defaults.afterLeaveOrganizationUrl,
  } = props;
  return { ...props, customPages, pageOrder, apiKeysProps, afterLeaveOrganizationUrl };
}

export function UserProfileSurface({
  presentation,
  combined,
  organizationProfileProps,
  customPages,
  pageOrder,
  defaultPage,
  additionalOAuthScopes,
  fallback,
  apiKeysProps: { hide: hideAPIKeys = false, ...apiKeysProps } = {},
}: CombinedProfileProps & { presentation: NonNullable<UserProfileOptions['mode']>; combined: boolean }) {
  const model = useUserProfileUserModel();
  const builtInPages = useUserProfilePages();

  if (model.status === 'loading') {
    return fallback ?? null;
  }
  if (model.status === 'hidden') {
    return null;
  }

  const viewProps: AccountViewProps = {
    elevation: 'flush',
    initialPage: defaultPage ?? pageOrder?.[0] ?? 'account',
    customPages,
    pageOrder,
    pages: {
      account: <UserProfileProfilePanel />,
      security: <UserProfileSecurityPanel />,
      apiKeys:
        builtInPages.includes('apiKeys') && !hideAPIKeys ? <UserProfileApiKeysPanel {...apiKeysProps} /> : undefined,
    },
  };

  return (
    <UserProfileProvider
      additionalOAuthScopes={additionalOAuthScopes}
      mode={presentation}
      combined={combined}
    >
      {combined ? (
        <CombinedUserProfileView
          {...viewProps}
          organizationProfileProps={organizationProfileProps}
        />
      ) : (
        <AccountUserProfileView {...viewProps} />
      )}
    </UserProfileProvider>
  );
}

type AccountViewProps = Omit<UserProfileViewProps, 'activePage' | 'onPageChange' | 'organization'> & {
  initialPage: UserProfileViewProps['activePage'];
};

function AccountUserProfileView({ initialPage, ...viewProps }: AccountViewProps) {
  const navigation = useProfilePagesController(initialPage, userProfilePageIds(viewProps));

  return (
    <UserProfileView
      {...viewProps}
      {...navigation}
    />
  );
}

function CombinedUserProfileView({
  initialPage,
  organizationProfileProps: { customPages, pageOrder, apiKeysProps, afterLeaveOrganizationUrl } = {},
  ...viewProps
}: AccountViewProps & Pick<CombinedProfileProps, 'organizationProfileProps'>) {
  const model = useOrganizationProfileModel();
  const organization =
    model.status === 'ready'
      ? { pages: organizationProfilePanels(model.pages, apiKeysProps), customPages, pageOrder }
      : undefined;
  const pageIds = model.status === 'loading' ? undefined : userProfilePageIds({ ...viewProps, organization });
  const navigation = useProfilePagesController(
    initialPage,
    pageIds,
    initialPage.startsWith(ORGANIZATION_PAGE_PREFIX)
      ? pageIds?.find(id => id.startsWith(ORGANIZATION_PAGE_PREFIX))
      : undefined,
  );

  return (
    <OrganizationProfileProvider afterLeaveOrganizationUrl={afterLeaveOrganizationUrl}>
      <UserProfileView
        {...viewProps}
        {...navigation}
        organization={organization}
      />
    </OrganizationProfileProvider>
  );
}

export function OrganizationProfileSurface({
  customPages,
  pageOrder,
  defaultPage,
  afterLeaveOrganizationUrl,
  fallback,
  apiKeysProps,
}: OrganizationProfileProps) {
  const model = useOrganizationProfileModel();
  const pages = model.status === 'ready' ? organizationProfilePanels(model.pages, apiKeysProps) : undefined;
  const navigation = useProfilePagesController(
    defaultPage ?? pageOrder?.[0] ?? 'general',
    pages && organizationProfilePageIds({ pages, customPages, pageOrder }),
  );

  if (model.status === 'loading') {
    return fallback ?? null;
  }
  if (!pages) {
    return null;
  }

  return (
    <OrganizationProfileProvider afterLeaveOrganizationUrl={afterLeaveOrganizationUrl}>
      <OrganizationProfileView
        elevation='flush'
        {...navigation}
        customPages={customPages}
        pageOrder={pageOrder}
        pages={pages}
      />
    </OrganizationProfileProvider>
  );
}

function organizationProfilePanels(
  available: readonly OrganizationProfilePageId[],
  { hide: hideAPIKeys = false, ...apiKeysProps }: APIKeysPageProps = {},
): OrganizationProfilePages {
  return {
    general: <OrganizationProfileGeneralPanel />,
    members: available.includes('members') ? <OrganizationProfileMembersPanel /> : undefined,
    apiKeys:
      available.includes('apiKeys') && !hideAPIKeys ? <OrganizationProfileApiKeysPanel {...apiKeysProps} /> : undefined,
  };
}
