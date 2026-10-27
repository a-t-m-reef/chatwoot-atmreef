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

// What the server holds per draft key, so unchanged drafts are not sent again.
const serverSnapshots = {};

const nowInSeconds = () => Math.floor(Date.now() / 1000);

const fromServer = data => ({
  message: data.message || '',
  toEmails: data.to_emails || '',
  ccEmails: data.cc_emails || '',
  bccEmails: data.bcc_emails || '',
  inReplyTo: data.in_reply_to || null,
  updatedAt: data.updated_at,
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

const setMyDraft = ({ commit, state: $state }, conversationId, hasDraft) => {
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
  // Pulls the agent's server draft. Returns true when it is newer than `since`
  // (the local copy's updatedAt when the reply box opened) and replaced it.
  fetch: async ({ commit }, { key, conversationId, replyType, since }) => {
    try {
      const { data } = await ConversationAPI.getDraft({
        conversationId,
        replyType: toApiReplyType(replyType),
      });
      commit(types.SET_OTHER_DRAFTERS, {
        conversationId,
        names: data.other_drafters || [],
      });
      if (!data.has_draft) {
        serverSnapshots[key] = EMPTY_SNAPSHOT;
        return false;
      }

      const serverDraft = fromServer(data);
      serverSnapshots[key] = snapshotOf(serverDraft);
      if (serverDraft.updatedAt <= (since || 0)) return false;

      commit(types.SET_DRAFT_MESSAGES, { key, ...serverDraft });
      return true;
    } catch (error) {
      return false;
    }
  },
  // Pushes the local draft to the server, or deletes the server copy when the draft is empty.
  sync: async (context, { key, conversationId, replyType, isEmpty }) => {
    const draft = toDraft(context.state.records[key]);
    const snapshot = isEmpty ? EMPTY_SNAPSHOT : snapshotOf(draft);
    if (serverSnapshots[key] === snapshot) return;

    serverSnapshots[key] = snapshot;
    const params = { conversationId, replyType: toApiReplyType(replyType) };
    try {
      if (isEmpty) {
        await ConversationAPI.deleteDraft(params);
      } else {
        await ConversationAPI.saveDraft({ ...params, draft });
      }
      if (replyType === REPLY_EDITOR_MODES.REPLY) {
        setMyDraft(context, conversationId, !isEmpty);
      }
    } catch (error) {
      delete serverSnapshots[key];
    }
  },
  remove: async (context, { key, conversationId, replyType }) => {
    context.commit(types.REMOVE_DRAFT_MESSAGES, { key });
    await context.dispatch('sync', {
      key,
      conversationId,
      replyType,
      isEmpty: true,
    });
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
    // Only real edits move updatedAt, so re-saving an unchanged draft never beats a newer server copy.
    if (!draft.updatedAt) {
      updated.updatedAt =
        snapshotOf(updated) === snapshotOf(existing) && existing.updatedAt
          ? existing.updatedAt
          : nowInSeconds();
    }
    $state.records = {
      ...$state.records,
      [key]: updated,
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
