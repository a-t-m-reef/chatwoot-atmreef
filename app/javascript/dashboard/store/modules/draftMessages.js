import types from '../mutation-types';

import ConversationAPI from 'dashboard/api/inbox/conversation';
import DraftsAPI from 'dashboard/api/drafts';
import { REPLY_EDITOR_MODES } from 'dashboard/components/widgets/WootWriter/constants';
import { LocalStorage } from 'shared/helpers/localStorage';
import { LOCAL_STORAGE_KEYS } from 'dashboard/constants/localStorage';

// Drafts saved before server sync existed were plain strings.
const toDraft = record =>
  typeof record === 'string' ? { message: record } : record || {};

const SYNCED_FIELDS = [
  'message',
  'toEmails',
  'ccEmails',
  'bccEmails',
  'inReplyTo',
];
const EMPTY_SNAPSHOT = '';
const snapshotOf = draft =>
  JSON.stringify(SYNCED_FIELDS.map(field => draft[field] || ''));

// What the server holds per draft key, learned from the last fetch or sync.
// A key with no entry is unknown, and an unknown server state is never overwritten.
const serverSnapshots = {};

const fromServer = data => ({
  message: data.message || '',
  toEmails: data.to_emails || '',
  ccEmails: data.cc_emails || '',
  bccEmails: data.bcc_emails || '',
  inReplyTo: data.in_reply_to || null,
  serverUpdatedAt: data.updated_at,
});

const toApiReplyType = replyType => replyType.toLowerCase();

const state = {
  records: LocalStorage.get(LOCAL_STORAGE_KEYS.DRAFT_MESSAGES) || {},
  replyEditorMode: REPLY_EDITOR_MODES.REPLY,
  myDraftConversationIds: [],
  otherDrafters: {},
};

export const getters = {
  get: _state => key => {
    return toDraft(_state.records[key]).message || '';
  },
  getDraft: _state => key => toDraft(_state.records[key]),
  getReplyEditorMode: _state => _state.replyEditorMode,
  hasMyDraft: _state => conversationId =>
    _state.myDraftConversationIds.includes(Number(conversationId)),
  getOtherDrafters: _state => conversationId =>
    _state.otherDrafters[conversationId] || [],
};

const setMyDraft = (
  { commit, state: $state },
  conversationId,
  replyType,
  hasDraft
) => {
  if (replyType !== REPLY_EDITOR_MODES.REPLY) return;

  const id = Number(conversationId);
  const others = $state.myDraftConversationIds.filter(
    existingId => existingId !== id
  );
  commit(
    types.SET_MY_DRAFT_CONVERSATION_IDS,
    hasDraft ? [...others, id] : others
  );
};

export const actions = {
  set: async ({ commit }, { key, ...draft }) => {
    commit(types.SET_DRAFT_MESSAGES, { key, ...draft });
  },
  delete: ({ commit }, { key }) => {
    commit(types.REMOVE_DRAFT_MESSAGES, { key });
  },
  setReplyEditorMode: ({ commit }, { mode }) => {
    commit(types.SET_REPLY_EDITOR_MODE, { mode });
  },
  // Reconciles the local copy with the agent's server draft. Returns true when the
  // local copy changed, so the reply box should show it again.
  fetch: async (context, { key, conversationId, replyType, isLocalEmpty }) => {
    const { commit, state: $state } = context;
    let data;
    try {
      ({ data } = await ConversationAPI.getDraft({
        conversationId,
        replyType: toApiReplyType(replyType),
      }));
    } catch (error) {
      return false;
    }
    commit(types.SET_OTHER_DRAFTERS, {
      conversationId,
      names: data.other_drafters || [],
    });

    const localDraft = toDraft($state.records[key]);
    if (!data.has_draft) {
      serverSnapshots[key] = EMPTY_SNAPSHOT;
      // It was on the server and this device has nothing new: it was sent or
      // discarded elsewhere, so the stale local copy must not come back.
      if (localDraft.serverUpdatedAt && !localDraft.dirty) {
        commit(types.REMOVE_DRAFT_MESSAGES, { key });
        return true;
      }
      return false;
    }

    const serverDraft = fromServer(data);
    serverSnapshots[key] = snapshotOf(serverDraft);
    setMyDraft(context, conversationId, replyType, true);
    // Unsynced text typed on this device wins; it syncs over the server copy.
    if (localDraft.dirty && !isLocalEmpty) return false;
    if (
      !isLocalEmpty &&
      localDraft.serverUpdatedAt === serverDraft.serverUpdatedAt
    ) {
      return false;
    }

    commit(types.SET_DRAFT_MESSAGES, { key, ...serverDraft, dirty: false });
    return true;
  },
  // Pushes this device's edits to the server, or deletes the server copy when
  // the agent emptied the draft. Does nothing until the server state is known.
  sync: async (context, { key, conversationId, replyType, isEmpty }) => {
    const draft = toDraft(context.state.records[key]);
    const knownSnapshot = serverSnapshots[key];
    if (knownSnapshot === undefined || !draft.dirty) return;

    const snapshot = isEmpty ? EMPTY_SNAPSHOT : snapshotOf(draft);
    if (knownSnapshot === snapshot) {
      context.commit(types.MARK_DRAFT_SYNCED, { key, snapshot });
      return;
    }

    serverSnapshots[key] = snapshot;
    const params = { conversationId, replyType: toApiReplyType(replyType) };
    try {
      if (isEmpty) {
        await ConversationAPI.deleteDraft(params);
        context.commit(types.MARK_DRAFT_SYNCED, {
          key,
          snapshot,
          serverUpdatedAt: null,
        });
      } else {
        const { data } = await ConversationAPI.saveDraft({ ...params, draft });
        context.commit(types.MARK_DRAFT_SYNCED, {
          key,
          snapshot,
          serverUpdatedAt: data.updated_at,
        });
      }
      setMyDraft(context, conversationId, replyType, !isEmpty);
    } catch (error) {
      serverSnapshots[key] = knownSnapshot;
    }
  },
  // The reply was sent: drop the draft here and on the server.
  remove: async (context, { key, conversationId, replyType }) => {
    context.commit(types.REMOVE_DRAFT_MESSAGES, { key });
    serverSnapshots[key] = EMPTY_SNAPSHOT;
    setMyDraft(context, conversationId, replyType, false);
    try {
      await ConversationAPI.deleteDraft({
        conversationId,
        replyType: toApiReplyType(replyType),
      });
    } catch (error) {
      delete serverSnapshots[key];
    }
  },
  fetchMine: async ({ commit }) => {
    try {
      const { data } = await DraftsAPI.get();
      commit(
        types.SET_MY_DRAFT_CONVERSATION_IDS,
        data.map(draft => draft.conversation_id)
      );
    } catch (error) {
      // The card marker is a convenience; the reply box still restores drafts.
    }
  },
};

export const mutations = {
  [types.SET_DRAFT_MESSAGES]($state, { key, ...draft }) {
    const existing = toDraft($state.records[key]);
    const updated = { ...existing, ...draft };
    // A change to the content is an edit this device has not synced yet.
    if (draft.dirty === undefined) {
      updated.dirty =
        Boolean(existing.dirty) || snapshotOf(updated) !== snapshotOf(existing);
    }
    $state.records = {
      ...$state.records,
      [key]: updated,
    };
    LocalStorage.set(LOCAL_STORAGE_KEYS.DRAFT_MESSAGES, $state.records);
  },
  [types.MARK_DRAFT_SYNCED]($state, { key, snapshot, serverUpdatedAt }) {
    const existing = $state.records[key];
    if (!existing) return;

    const draft = toDraft(existing);
    const isEmptySync = snapshot === EMPTY_SNAPSHOT;
    // Edits made while the request was in flight stay dirty.
    const isCurrent = isEmptySync || snapshotOf(draft) === snapshot;
    $state.records = {
      ...$state.records,
      [key]: {
        ...draft,
        dirty: isCurrent ? false : draft.dirty,
        ...(serverUpdatedAt !== undefined && { serverUpdatedAt }),
      },
    };
    LocalStorage.set(LOCAL_STORAGE_KEYS.DRAFT_MESSAGES, $state.records);
  },
  [types.REMOVE_DRAFT_MESSAGES]($state, { key }) {
    const { [key]: draftToBeRemoved, ...updatedRecords } = $state.records;
    $state.records = updatedRecords;
    LocalStorage.set(LOCAL_STORAGE_KEYS.DRAFT_MESSAGES, $state.records);
  },
  [types.SET_REPLY_EDITOR_MODE]($state, { mode }) {
    $state.replyEditorMode = mode;
  },
  [types.SET_MY_DRAFT_CONVERSATION_IDS]($state, conversationIds) {
    $state.myDraftConversationIds = conversationIds;
  },
  [types.SET_OTHER_DRAFTERS]($state, { conversationId, names }) {
    $state.otherDrafters = { ...$state.otherDrafters, [conversationId]: names };
  },
};

export default {
  namespaced: true,
  state,
  getters,
  actions,
  mutations,
};
