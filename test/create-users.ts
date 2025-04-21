import { id, init, TransactionChunk } from '@instantdb/admin';
import schema, { AppSchema } from '../instant.schema';
import 'dotenv/config'

const APP_ID = process.env.INSTANT_APP_ID;
const ADMIN_TOKEN = process.env.INSTANT_ADMIN_TOKEN;

export const adminDb = init({ appId: APP_ID, adminToken: ADMIN_TOKEN, schema })

// Utility type to create a copy of T with all booleans set to type "true".
// Used for creating partials that have all potential options keys
type ForceBooleansToTrue<T> = {
  // replace optional booleans with true
  [K in keyof T]-?: T[K] extends boolean | undefined
  ? true
  : // replace optional numbers with 1
  T[K] extends boolean | number | undefined
  ? 1
  : NonNullable<T[K]>;
};

interface CreateUserOptions {
  numUsers?: number;
  profile?: boolean;
  team?: boolean;
  invitation?: string; // Email to invite
  project?: boolean;
  blog?: boolean | number;
  domain?: boolean | number;
  page?: boolean | number;
  component?: boolean | number;
  cost?: boolean | number;
}

type UserWithProfile = {
  profileId: string;
};

type UserWithTeam = {
  teamId: string;
  memberId: string;
};

type UserWithInvitation = {
  invitationId: string;
};

type UserWithProject = {
  projectId: string;
};

type UserWithBlogs = {
  blogIds: string[];
};

type UserWithDomains = {
  domainIds: string[];
};

type UserWithPages = {
  pageIds: string[];
};

type UserWithComponents = {
  componentIds: string[];
};

type UserWithCosts = {
  costIds: string[];
};

type UserBase = {
  email: string;
  db: ReturnType<typeof adminDb.asUser>;
  id: string;
  delete: () => Promise<void>;
};

type UserWithResources<T extends CreateUserOptions> = UserBase &
  (T['profile'] extends true ? UserWithProfile : UserBase) &
  (T['team'] extends true ? UserWithTeam : UserBase) &
  (T['invitation'] extends string ? UserWithInvitation : UserBase) &
  (T['project'] extends true ? UserWithProject : UserBase) &
  (T['blog'] extends true | number ? UserWithBlogs : UserBase) &
  (T['domain'] extends true | number ? UserWithDomains : UserBase) &
  (T['page'] extends true | number ? UserWithPages : UserBase) &
  (T['component'] extends true | number ? UserWithComponents : UserBase) &
  (T['cost'] extends true | number ? UserWithCosts : UserBase);

type PartialUserWithResources = UserBase &
  Partial<UserWithResources<ForceBooleansToTrue<CreateUserOptions>>>;

type AnyLanternTransaction = TransactionChunk<AppSchema, keyof AppSchema['entities']>;

const deleteUser = async (userId: string) => {
  await adminDb.transact(adminDb.tx.$users[userId].delete());
};

export const createUsers = async <T extends CreateUserOptions>(
  prefix: string = '',
  options?: T
): Promise<UserWithResources<T>[]> => {
  if (prefix != '') prefix += '_';

  // Generate user IDs and emails
  const userCount = options?.numUsers || 2;
  const userIds = Array.from({ length: userCount }, () => id());
  const emails = userIds.map(userId => `${prefix}${userId.substring(0, 6)}@lanterntest`);

  // Create base user objects
  const users = userIds.map(
    (userId, index) =>
      ({
        email: emails[index],
        db: adminDb.asUser({ email: emails[index] }),
        id: userId,
        delete: () => {
          return deleteUser(userId);
        },
      }) as PartialUserWithResources
  );

  // Create base users transaction
  const createUsersTxs = users.map(u => adminDb.tx.$users[u.id].update({ email: u.email }));
  await adminDb.transact(createUsersTxs);

  // Arrays to hold transactions for each user
  const createRestTxss = users.map(() => [] as AnyLanternTransaction[]);

  // Create additional resources if requested
  if (options) {
    if (options.profile) {
      const profileIds = users.map(() => id());

      users.forEach((user, i) => {
        // Add profile creation transaction
        createRestTxss[i].push(
          user.db.tx.profiles[profileIds[i]]
            .update({
              name: `User ${i} ${prefix}`,
              createdAt: Date.now(),
            })
            .link({ user: user.id })
        );

        // Store profile ID in user object
        user.profileId = profileIds[i];
      });
    }

    // Create teams
    if (options.team) {
      if (!options.profile) {
        throw new Error('Cannot create team without profile. Enable profile option first.');
      }

      const teamIds = users.map(() => id());
      const memberIds = users.map(() => id());

      users.forEach((user, i) => {
        // Add team and member creation transactions
        createRestTxss[i].push(
          user.db.tx.teams[teamIds[i]].update({
            name: `Team ${i} ${prefix}`,
            slug: `team-${i}-${prefix}-${Date.now()}`,
            createdAt: Date.now(),
          }),
          user.db.tx.members[memberIds[i]]
            .update({
              role: 'admin',
              createdAt: Date.now(),
            })
            .link({ profile: user.profileId, team: teamIds[i] })
        );

        // Store team and member IDs in user object
        user.teamId = teamIds[i];
        user.memberId = memberIds[i];
      });
    }

    // Create invitations
    if (typeof options.invitation === 'string') {
      if (!options.profile || !options.team) {
        throw new Error(
          'Cannot create invitation without profile and team. Enable both options first.'
        );
      }

      const invitationIds = users.map(() => id());

      users.forEach((user, i) => {
        // Add invitation creation transaction
        createRestTxss[i].push(
          user.db.tx.invitations[invitationIds[i]]
            .update({
              email: options.invitation as string,
              role: 'member',
              status: 'pending',
              createdAt: Date.now(),
            })
            .link({ inviter: user.profileId, team: user.teamId })
        );

        user.invitationId = invitationIds[i];
      });
    }

    if (options.project) {
      if (!options.team) {
        throw new Error('Cannot create project without team. Enable team option first.');
      }

      const projectIds = users.map(() => id());

      users.forEach((user, i) => {
        // Add project creation transaction
        createRestTxss[i].push(
          user.db.tx.projects[projectIds[i]]
            .update({
              name: `Project ${i} ${prefix}`,
              slug: `project-${i}-${prefix}-${Date.now()}`,
              createdAt: Date.now(),
            })
            .link({ team: user.teamId })
        );

        user.projectId = projectIds[i];
      });
    }

    // Create blogs if requested
    if (options.blog && options.project) {
      users.forEach((user, i) => {
        if (!user.projectId) return;

        const count = typeof options.blog === 'number' ? options.blog : 1;
        const blogIds: string[] = [];

        for (let j = 0; j < count; j++) {
          const blogId = id();
          createRestTxss[i].push(
            user.db.tx.blogs[blogId]
              .update({
                title: `Test Blog ${i}-${j}`,
                slug: `test-blog-${i}-${j}-${Date.now()}`,
                json: {},
                html: '<p>Test</p>',
                createdAt: Date.now(),
                updatedAt: Date.now(),
              })
              .link({ project: user.projectId })
          );
          blogIds.push(blogId);
        }

        user.blogIds = blogIds;
      });
    }

    // Create domains if requested
    if (options.domain && options.project) {
      users.forEach((user, i) => {
        if (!user.projectId) return;

        const count = typeof options.domain === 'number' ? options.domain : 1;
        const domainIds: string[] = [];

        for (let j = 0; j < count; j++) {
          const domainId = id();
          createRestTxss[i].push(
            user.db.tx.domains[domainId]
              .update({
                url: `test-domain-${i}-${j}.example.com`,
                createdAt: Date.now(),
              })
              .link({ project: user.projectId })
          );
          domainIds.push(domainId);
        }

        user.domainIds = domainIds;
      });
    }

    // Create pages if requested
    if (options.page && options.project) {
      users.forEach((user, i) => {
        if (!user.projectId) return;

        const count = typeof options.page === 'number' ? options.page : 1;
        const pageIds: string[] = [];

        for (let j = 0; j < count; j++) {
          const pageId = id();
          createRestTxss[i].push(
            user.db.tx.pages[pageId]
              .update({
                path: `/test-page-${i}-${j}`,
                createdAt: Date.now(),
                updatedAt: Date.now(),
              })
              .link({ project: user.projectId })
          );
          pageIds.push(pageId);
        }

        user.pageIds = pageIds;
      });
    }

    // Create components if requested
    if (options.component && options.page) {
      users.forEach((user, i) => {
        if (!user.pageIds || user.pageIds.length === 0) return;

        const count = typeof options.component === 'number' ? options.component : 1;
        const componentIds: string[] = [];

        // Create components for the first page
        const pageId = user.pageIds[0];

        for (let j = 0; j < count; j++) {
          const componentId = id();
          createRestTxss[i].push(
            user.db.tx.components[componentId]
              .update({
                ordinality: j + 1,
                type: j === 0 ? 'Hero' : 'Section',
                design: j === 0 ? 'Hero1' : 'Section1',
                data: {},
                createdAt: Date.now(),
                updatedAt: Date.now(),
              })
              .link({ page: pageId })
          );
          componentIds.push(componentId);
        }

        user.componentIds = componentIds;
      });
    }

    // Create costs if requested
    if (options.cost && options.project) {
      users.forEach((user, i) => {
        if (!user.projectId) return;

        const count = typeof options.cost === 'number' ? options.cost : 1;
        const costIds: string[] = [];

        for (let j = 0; j < count; j++) {
          const costId = id();
          createRestTxss[i].push(
            user.db.tx.costs[costId]
              .update({
                internalCost: 100 * (j + 1),
                startOfMonth: Date.now() - j * 30 * 24 * 60 * 60 * 1000, // Different months
              })
              .link({ project: user.projectId })
          );
          costIds.push(costId);
        }

        user.costIds = costIds;
      });
    }
  }

  // Execute all transactions for each user
  const transactionPromises = users.map((user, i) => {
    return user.db.transact(createRestTxss[i]);
  });

  await Promise.all(transactionPromises);

  return users as UserWithResources<T>[];
};
