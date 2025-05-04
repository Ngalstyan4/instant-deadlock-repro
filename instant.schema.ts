import { i } from '@instantdb/admin';

// --- DEFINE YOUR SCHEMA ---

const _schema = i.schema({
  /*
 currently many needed indexes are commented out because they triggered an instantdb 500 error

  {
    "name": "InstantAPIError",
    "status": 500,
    "body": {
      "type": "sql-exception",
      "message": "SQL Exception: deadlock-detected",
      "hint": {
        "table": null,
        "condition": "deadlock-detected",
        "constraint": null,
        "debug-uri": "https://ui.honeycomb.io/instantdb/environments/prod/datasets/instant-server/trace?trace_id=23ca65149605845c0f2171b9cd4b3597&span=79237a276b9edf94"
      }
    }
  }
  */
  entities: {
    $users: i.entity({
      email: i.string().unique().indexed(),
    }),
    profiles: i.entity({
      name: i.string(),
      image: i.string().optional(),
      githubInstallationId: i.string().optional(),
      createdAt: i.date(),
    }),
    teams: i.entity({
      name: i.string(),
      slug: i.string().unique().indexed(),
      createdAt: i.date(),
    }),
    members: i.entity({
      role: i.string(),
      createdAt: i.date(),
      lastViewedAt: i.date().optional(),
    }),
    invitations: i.entity({
      email: i.string().indexed(),
      role: i.string(),
      status: i.string(),
      createdAt: i.date(),
    }),
    projects: i.entity({
      name: i.string(),
      slug: i.string().unique().indexed(),
      bodyFont: i.string().optional(),
      codeFont: i.string().optional(),
      colorPrimary: i.string().optional(),
      colorSecondary: i.string().optional(),
      colorNeutral: i.string().optional(),
      githubRepo: i.string().optional(),
      githubInstallationId: i.string().optional(),
      createdAt: i.date(),
    }),
    blogs: i.entity({
      title: i.string(),
      slug: i.string().indexed(),
      json: i.json(),
      html: i.string(),
      createdAt: i.date(),
      updatedAt: i.date(),
      publishedAt: i.date().optional(),
    }),
    domains: i.entity({
      url: i.string(),
      createdAt: i.date(),
    }),
    pages: i.entity({
      path: i.string(),
      code: i.string().optional(),
      metaTitle: i.string().optional(),
      metaDescription: i.string().optional(),
      openGraphImage: i.string().optional(),
      favicon: i.string().optional(),
      createdAt: i.date(),
      updatedAt: i.date(),
    }),
    components: i.entity({
      ordinality: i.number().indexed(), // Order that it appears in the parent component
      type: i.string(), // e.g., Navbar, Hero, etc.
      design: i.string(), // e.g., Navbar1, Navbar2, etc.
      data: i.json(),
      createdAt: i.date(),
      updatedAt: i.date(),
    }),
    costs: i.entity({
      internalCost: i.number(),
      startOfMonth: i.date().indexed(),
      startOfMonthUnindexed: i.date(),
    }),

    costs2: i.entity({
      internalCost: i.number(),
      startOfMonth: i.date().indexed(),
    }),

    instantdb_500_indexed_date: i.entity({
      date: i.date().indexed(),
    }),
  },
  links: {
    userProfile: {
      forward: { on: 'profiles', has: 'one', label: 'user', onDelete: 'cascade' },
      reverse: { on: '$users', has: 'one', label: 'profile', onDelete: 'cascade' },
    },
    profileMemberships: {
      forward: { on: 'members', has: 'one', label: 'profile', onDelete: 'cascade' },
      reverse: { on: 'profiles', has: 'many', label: 'memberships' },
    },
    teamMembers: {
      forward: { on: 'members', has: 'one', label: 'team', onDelete: 'cascade' },
      reverse: { on: 'teams', has: 'many', label: 'members' },
    },
    teamProjects: {
      forward: { on: 'projects', has: 'one', label: 'team', onDelete: 'cascade' },
      reverse: { on: 'teams', has: 'many', label: 'projects' },
    },
    teamInvitations: {
      forward: { on: 'invitations', has: 'one', label: 'team', onDelete: 'cascade' },
      reverse: { on: 'teams', has: 'many', label: 'invitations' },
    },
    invitationInviter: {
      forward: { on: 'invitations', has: 'one', label: 'inviter', onDelete: 'cascade' },
      reverse: { on: 'profiles', has: 'many', label: 'sentInvitations' },
    },
    projectBlogs: {
      forward: { on: 'blogs', has: 'one', label: 'project', onDelete: 'cascade' },
      reverse: { on: 'projects', has: 'many', label: 'blogs' },
    },
    blogAuthor: {
      forward: { on: 'blogs', has: 'many', label: 'authors' },
      reverse: { on: 'profiles', has: 'many', label: 'blogs' },
    },
    projectDomains: {
      forward: { on: 'domains', has: 'one', label: 'project', onDelete: 'cascade' },
      reverse: { on: 'projects', has: 'many', label: 'domains' },
    },
    projectPages: {
      forward: { on: 'pages', has: 'one', label: 'project', onDelete: 'cascade' },
      reverse: { on: 'projects', has: 'many', label: 'pages' },
    },
    projectCosts: {
      forward: { on: 'costs', has: 'one', label: 'project', onDelete: 'cascade' },
      reverse: { on: 'projects', has: 'many', label: 'costs' },
    },
    projectCosts2: {
      forward: { on: 'costs2', has: 'one', label: 'project', onDelete: 'cascade' },
      reverse: { on: 'projects', has: 'many', label: 'costs2' },
    },
    pageComponents: {
      forward: { on: 'components', has: 'one', label: 'page', onDelete: 'cascade' },
      reverse: { on: 'pages', has: 'many', label: 'components' },
    },
    componentHierarchy: {
      forward: { on: 'components', has: 'one', label: 'parent', onDelete: 'cascade' },
      reverse: { on: 'components', has: 'many', label: 'children' },
    },
  },
});

// This helps Typescript display better intellisense
type _AppSchema = typeof _schema;
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
interface AppSchema extends _AppSchema { }
const schema: AppSchema = _schema;

export type { AppSchema };
export default schema;
