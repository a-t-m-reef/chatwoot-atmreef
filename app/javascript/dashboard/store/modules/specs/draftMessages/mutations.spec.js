import types from '../../../mutation-types';
import { mutations } from '../../draftMessages';

describe('#mutations', () => {
  describe('#SET_DRAFT_MESSAGES', () => {
    it('stores a new draft as an unsynced edit', () => {
      const state = { records: {} };
      mutations[types.SET_DRAFT_MESSAGES](state, {
        key: 'draft-32-REPLY',
        message: 'Hey how ',
      });
      expect(state.records).toEqual({
        'draft-32-REPLY': { message: 'Hey how ', dirty: true },
      });
    });

    it('does not mark an unchanged save as an edit', () => {
      const state = {
        records: { 'draft-32-REPLY': { message: 'Same', dirty: false } },
      };
      mutations[types.SET_DRAFT_MESSAGES](state, {
        key: 'draft-32-REPLY',
        message: 'Same',
      });
      expect(state.records['draft-32-REPLY'].dirty).toBe(false);
    });

    it('upgrades a legacy string draft', () => {
      const state = { records: { 'draft-1-REPLY': 'Old text' } };
      mutations[types.SET_DRAFT_MESSAGES](state, {
        key: 'draft-1-REPLY',
        ccEmails: 'a@b.com',
      });
      expect(state.records['draft-1-REPLY']).toEqual({
        message: 'Old text',
        ccEmails: 'a@b.com',
        dirty: true,
      });
    });
  });

  describe('#MARK_DRAFT_SYNCED', () => {
    it('clears dirty and records the server time', () => {
      const state = {
        records: { 'draft-2-REPLY': { message: 'Hi', dirty: true } },
      };
      const snapshot = JSON.stringify(['Hi', '', '', '', '']);
      mutations[types.MARK_DRAFT_SYNCED](state, {
        key: 'draft-2-REPLY',
        snapshot,
        serverUpdatedAt: 300,
      });
      expect(state.records['draft-2-REPLY']).toEqual({
        message: 'Hi',
        dirty: false,
        serverUpdatedAt: 300,
      });
    });

    it('keeps edits made while the save was in flight dirty', () => {
      const state = {
        records: { 'draft-3-REPLY': { message: 'Hi there', dirty: true } },
      };
      mutations[types.MARK_DRAFT_SYNCED](state, {
        key: 'draft-3-REPLY',
        snapshot: JSON.stringify(['Hi', '', '', '', '']),
        serverUpdatedAt: 300,
      });
      expect(state.records['draft-3-REPLY'].dirty).toBe(true);
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
