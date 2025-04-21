import type { InstantRules } from '@instantdb/react';

// this is supposed to be a hard upper bound for most per-user entities that can
// be used through the permissions. The goal is not to have an accurate upper bound,
// but to have a ceiling above what should be reasonably needed and can apply to a
// variety of entities to ensure someone cannot fill our DB with a single user
export const MAX_ITEMS = 100;
const rules = {
  $default: {
    allow: {
      // "$default": "false",
      // create: 'false',
      // In general, deleting things from DB requires additional server actions. So, we default to not allowing deleting anything
      // from the client directly. All deletes by default must go through admin client, which bypasses any permissions
      delete: 'false',
    },
  },

  attrs: {
    allow: {
      // we enforce a strict schema, so should not allow creating new attrs
      $default: 'false',
    },
  },

  profiles: {
    allow: {
      view: 'auth.id in data.ref("user.id")',
      create: 'auth.id in data.ref("user.id") && data.name != null',
      update: 'auth.id in data.ref("user.id") && newData.name != null && hasValidUserLink',
    },
    bind: [
      'hasValidUserLink',
      'newData.user != null && newData.user == auth.id',
      // ^^^ 'newData.user in auth.ref("$user.id")' would be equivalent, but could be slower [1]
      // [1]: https://lanterndb.slack.com/archives/C08MLQH6FA9/p1744737710858939
    ],
  },

  invitations: {
    allow: {
      view: 'inSameTeam',
      create: `data.email != null && data.role != null && data.status != null && data.createdAt != null && data.inviter != null && size(data.ref("team.id")) != 0 && limit`,
      update: 'false',
      delete: 'auth.id in data.ref("inviter.user.id")',
    },
    bind: [
      'inSameTeam',
      'auth.id in data.ref("team.members.profile.user.id")',
      // user cannot send >=MAX_ITEMS invitations
      'limit',
      `size(data.ref("inviter.sentInvitations.id")) < ${MAX_ITEMS}`,
    ],
  },

  members: {
    allow: {
      view: 'inSameTeam',
      // TODO: currently, can only create a member when creating a new team
      // will need to separately handle user invites
      create: `auth.id in data.ref("profile.user.id") && size(data.ref("team.members.id")) == 1 && hasRequiredAttrs && hasRequiredOneLinks && limit`,
      update: 'false',
    },
    bind: [
      'hasRequiredAttrs',
      'data.role != null && data.createdAt != null',
      'hasRequiredOneLinks',
      'size(data.ref("profile.id")) != 0 && size(data.ref("team.id")) != 0',
      'inSameTeam',
      'auth.id in data.ref("team.members.profile.user.id")',
      'limit',
      `size(data.ref("profile.memberships.id")) < ${MAX_ITEMS}`,
    ],
  },

  // user cannot be member in >=MAX_ITEMS teams
  teams: {
    allow: {
      view: 'auth.id in data.ref("members.profile.user.id")',
      create: `auth.id != null && size(auth.ref("$user.profile.memberships.id")) < ${MAX_ITEMS}`,
    },
  },

  projects: {
    allow: {
      view: 'inSameTeam',
      create: 'hasRequiredAttrs && data.team != null && linksValidTeam && limit',
      update: 'inSameTeam && updateHasRequiredAttrs && newData.team == data.team',
    },
    bind: [
      'inSameTeam',
      'auth.id in data.ref("team.members.profile.user.id")',
      'hasRequiredAttrs',
      'data.name != null && data.slug != null && data.createdAt != null',
      'updateHasRequiredAttrs',
      'newData.name != null && newData.slug != null && newData.createdAt != null',
      'linksValidTeam',
      'size(data.ref("team.id")) != 0',

      'limit',
      `size(data.ref("team.projects.id")) < ${MAX_ITEMS}`,
    ],
  },

  blogs: {
    allow: {
      view: 'inSameProject',
      create: 'hasRequiredBlogAttrs && data.project != null && linksValidProject',
      update: 'false',
    },
    bind: [
      'inSameProject',
      'auth.id in data.ref("project.team.members.profile.user.id")',
      'hasRequiredBlogAttrs',
      'data.title != null && data.slug != null && data.json != null && data.html != null && data.createdAt != null && data.updatedAt != null',
      'linksValidProject',
      'size(data.ref("project.id")) != 0',
    ],
  },
  domains: {
    allow: {
      view: 'inSameProject',
      create: 'hasRequiredDomainAttrs && data.project != null && linksValidProject',
      update: 'false',
    },
    bind: [
      'inSameProject',
      'auth.id in data.ref("project.team.members.profile.user.id")',
      'hasRequiredDomainAttrs',
      'data.url != null && data.createdAt != null',
      'linksValidProject',
      'size(data.ref("project.id")) != 0',
    ],
  },

  pages: {
    allow: {
      view: 'inSameProject',
      create: 'hasRequiredPageAttrs && data.project != null && linksValidProject',
      update: 'false',
      delete: 'false',
    },
    bind: [
      'inSameProject',
      'auth.id in data.ref("project.team.members.profile.user.id")',
      'hasRequiredPageAttrs',
      'data.path != null && data.createdAt != null && data.updatedAt != null',
      'linksValidProject',
      'size(data.ref("project.id")) != 0',
    ],
  },

  costs: {
    allow: {
      view: 'inSameProject',
      create: 'hasRequiredCostAttrs && data.project != null && linksValidProject',
      update: 'false',
    },
    bind: [
      'inSameProject',
      'auth.id in data.ref("project.team.members.profile.user.id")',
      'hasRequiredCostAttrs',
      'data.internalCost != null && data.startOfMonth != null',
      'linksValidProject',
      'size(data.ref("project.id")) != 0',
    ],
  },
} satisfies InstantRules;

export default rules;
