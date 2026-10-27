import types from '../../../mutation-types';
import { mutations } from '../../draftMessages';

describe('#mutations', () => {
  describe('#SET_DRAFT_MESSAGES', () => {
    it('sets the draft messages', () => {
      const state = {
        records: {},
      };
      mutations[types.SET_DRAFT_MESSAGES](state, {
        key: 'draft-32-REPLY',
        message: 'Hey how ',
      });
      expect(state.records).toEqual({
        'draft-32-REPLY': {
          message: 'Hey how ',
          updatedAt: expect.any(Number),
        },
      });
    });

    it('upgrades a legacy string draft and keeps updatedAt when nothing changed', () => {
      const state = {
        records: { 'draft-32-REPLY': { message: 'Same', updatedAt: 50 } },
      };
      mutations[types.SET_DRAFT_MESSAGES](state, {
        key: 'draft-32-REPLY',
        message: 'Same',
      });
      expect(state.records['draft-32-REPLY'].updatedAt).toEqual(50);

      const legacyState = { records: { 'draft-1-REPLY': 'Old text' } };
      mutations[types.SET_DRAFT_MESSAGES](legacyState, {
        key: 'draft-1-REPLY',
        ccEmails: 'a@b.com',
      });
      expect(legacyState.records['draft-1-REPLY']).toEqual({
        message: 'Old text',
        ccEmails: 'a@b.com',
        updatedAt: expect.any(Number),
      });
    });
  });

  describe('#SET_MY_DRAFT_CONVERSATION_IDS', () => {
    it('sets the conversation ids', () => {
      const state = { myDraftConversationIds: [] };
      mutations[types.SET_MY_DRAFT_CONVERSATION_IDS](state, [1, 2]);
      expect(state.myDraftConversationIds).toEqual([1, 2]);
    });
  });

  describe('#SET_OTHER_DRAFTERS', () => {
    it('sets the names per conversation', () => {
      const state = { otherDrafters: {} };
      mutations[types.SET_OTHER_DRAFTERS](state, {
        conversationId: 4,
        names: ['Kim'],
      });
      expect(state.otherDrafters).toEqual({ 4: ['Kim'] });
    });
  });

  describe('#REMOVE_DRAFT_MESSAGES', () => {
    it('removes the draft messages', () => {
      const state = {
        records: {
          'draft-32-REPLY': 'Hey how ',
        },
      };
      mutations[types.REMOVE_DRAFT_MESSAGES](state, {
        key: 'draft-32-REPLY',
      });
      expect(state.records).toEqual({});
    });
  });

  describe('#SET_REPLY_EDITOR_MODE', () => {
    it('sets the reply editor mode', () => {
      const state = {
        replyEditorMode: 'reply',
      };
      mutations[types.SET_REPLY_EDITOR_MODE](state, {
        mode: 'note',
      });
      expect(state.replyEditorMode).toEqual('note');
    });
  });
});
