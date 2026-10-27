import axios from 'axios';
import { actions } from '../../draftMessages';
import types from '../../../mutation-types';

const commit = vi.fn();
global.axios = axios;
vi.mock('axios');

describe('#actions', () => {
  beforeEach(() => {
    commit.mockClear();
    axios.get.mockReset();
    axios.patch.mockReset();
    axios.delete.mockReset();
  });

  describe('#set', () => {
    it('sends correct actions', async () => {
      await actions.set(
        { commit },
        { key: 'draft-32-REPLY', message: 'Hey how ', ccEmails: 'a@b.com' }
      );
      expect(commit.mock.calls).toEqual([
        [
          types.SET_DRAFT_MESSAGES,
          { key: 'draft-32-REPLY', message: 'Hey how ', ccEmails: 'a@b.com' },
        ],
      ]);
    });
  });

  describe('#delete', () => {
    it('removes the local draft', async () => {
      await actions.delete({ commit }, { key: 'draft-32-REPLY' });
      expect(commit.mock.calls).toEqual([
        [types.REMOVE_DRAFT_MESSAGES, { key: 'draft-32-REPLY' }],
      ]);
    });
  });

  describe('#setReplyEditorMode', () => {
    it('sends correct actions', async () => {
      await actions.setReplyEditorMode({ commit }, { mode: 'reply' });
      expect(commit.mock.calls).toEqual([
        [types.SET_REPLY_EDITOR_MODE, { mode: 'reply' }],
      ]);
    });
  });

  describe('#fetch', () => {
    const serverDraft = {
      has_draft: true,
      message: 'From laptop',
      cc_emails: 'cc@b.com',
      to_emails: 'to@b.com',
      bcc_emails: '',
      in_reply_to: 9,
      updated_at: 200,
      other_drafters: ['Kim'],
    };
    const fetchFor = (records, key, isLocalEmpty) =>
      actions.fetch(
        { commit, state: { records, myDraftConversationIds: [] } },
        { key, conversationId: 1, replyType: 'REPLY', isLocalEmpty }
      );

    it('applies the server draft when this device has nothing', async () => {
      axios.get.mockResolvedValue({ data: serverDraft });

      const changed = await fetchFor({}, 'draft-f1-REPLY', true);

      expect(changed).toBe(true);
      expect(axios.get).toHaveBeenCalledWith(
        expect.stringContaining('/conversations/1/draft_messages'),
        { params: { reply_type: 'reply' } }
      );
      expect(commit).toHaveBeenCalledWith(types.SET_OTHER_DRAFTERS, {
        conversationId: 1,
        names: ['Kim'],
      });
      expect(commit).toHaveBeenCalledWith(types.SET_DRAFT_MESSAGES, {
        key: 'draft-f1-REPLY',
        message: 'From laptop',
        toEmails: 'to@b.com',
        ccEmails: 'cc@b.com',
        bccEmails: '',
        inReplyTo: 9,
        serverUpdatedAt: 200,
        dirty: false,
      });
    });

    it('keeps unsynced text typed on this device', async () => {
      axios.get.mockResolvedValue({ data: serverDraft });
      const records = { 'draft-f2-REPLY': { message: 'Typing', dirty: true } };

      expect(await fetchFor(records, 'draft-f2-REPLY', false)).toBe(false);
      expect(commit).not.toHaveBeenCalledWith(
        types.SET_DRAFT_MESSAGES,
        expect.anything()
      );
    });

    it('takes a newer server copy over a clean local copy', async () => {
      axios.get.mockResolvedValue({ data: serverDraft });
      const records = {
        'draft-f3-REPLY': {
          message: 'Old',
          dirty: false,
          serverUpdatedAt: 100,
        },
      };

      expect(await fetchFor(records, 'draft-f3-REPLY', false)).toBe(true);
    });

    it('drops a synced local copy once the server draft is gone', async () => {
      axios.get.mockResolvedValue({
        data: { has_draft: false, other_drafters: [] },
      });
      const records = {
        'draft-f4-REPLY': { message: 'hi', dirty: false, serverUpdatedAt: 100 },
      };

      expect(await fetchFor(records, 'draft-f4-REPLY', false)).toBe(true);
      expect(commit).toHaveBeenCalledWith(types.REMOVE_DRAFT_MESSAGES, {
        key: 'draft-f4-REPLY',
      });
    });

    it('keeps a never-synced local draft when the server has none', async () => {
      axios.get.mockResolvedValue({
        data: { has_draft: false, other_drafters: [] },
      });
      const records = { 'draft-f5-REPLY': 'Legacy text' };

      expect(await fetchFor(records, 'draft-f5-REPLY', false)).toBe(false);
      expect(commit).not.toHaveBeenCalledWith(
        types.REMOVE_DRAFT_MESSAGES,
        expect.anything()
      );
    });
  });

  describe('#sync', () => {
    const syncFor = (records, key, isEmpty) =>
      actions.sync(
        { commit, state: { records, myDraftConversationIds: [] } },
        { key, conversationId: 5, replyType: 'REPLY', isEmpty }
      );

    it('never touches the server before its state is known', async () => {
      const records = { 'draft-s1-REPLY': { message: '', dirty: true } };

      await syncFor(records, 'draft-s1-REPLY', true);

      expect(axios.delete).not.toHaveBeenCalled();
      expect(axios.patch).not.toHaveBeenCalled();
    });

    it('saves a dirty draft and marks it synced', async () => {
      axios.get.mockResolvedValue({
        data: { has_draft: false, other_drafters: [] },
      });
      axios.patch.mockResolvedValue({ data: { updated_at: 300 } });
      const records = {
        'draft-s2-REPLY': {
          message: 'Hello',
          ccEmails: 'c@d.com',
          dirty: true,
        },
      };
      await actions.fetch(
        { commit, state: { records, myDraftConversationIds: [] } },
        {
          key: 'draft-s2-REPLY',
          conversationId: 5,
          replyType: 'REPLY',
          isLocalEmpty: false,
        }
      );

      await syncFor(records, 'draft-s2-REPLY', false);

      expect(axios.patch).toHaveBeenCalledWith(
        expect.stringContaining('/conversations/5/draft_messages'),
        {
          reply_type: 'reply',
          draft_message: {
            message: 'Hello',
            to_emails: undefined,
            cc_emails: 'c@d.com',
            bcc_emails: undefined,
            in_reply_to: undefined,
          },
        }
      );
      expect(commit).toHaveBeenCalledWith(types.MARK_DRAFT_SYNCED, {
        key: 'draft-s2-REPLY',
        snapshot: expect.any(String),
        serverUpdatedAt: 300,
      });
      expect(commit).toHaveBeenCalledWith(types.SET_MY_DRAFT_CONVERSATION_IDS, [
        5,
      ]);
    });

    it('skips a draft with no edits from this device', async () => {
      await syncFor(
        { 'draft-s3-REPLY': { message: 'Hello', dirty: false } },
        'draft-s3-REPLY',
        false
      );

      expect(axios.patch).not.toHaveBeenCalled();
    });

    it('deletes the server copy when the agent empties a known draft', async () => {
      axios.get.mockResolvedValue({
        data: { has_draft: true, message: 'Hi', updated_at: 1 },
      });
      axios.delete.mockResolvedValue({});
      const records = { 'draft-s4-REPLY': { message: '', dirty: true } };
      await actions.fetch(
        { commit, state: { records, myDraftConversationIds: [5] } },
        {
          key: 'draft-s4-REPLY',
          conversationId: 5,
          replyType: 'REPLY',
          isLocalEmpty: true,
        }
      );
      records['draft-s4-REPLY'] = { message: '', dirty: true };

      await syncFor(records, 'draft-s4-REPLY', true);

      expect(axios.delete).toHaveBeenCalledWith(
        expect.stringContaining('/conversations/5/draft_messages'),
        { params: { reply_type: 'reply' } }
      );
    });
  });

  describe('#remove', () => {
    it('removes the local draft and deletes the server copy', async () => {
      axios.delete.mockResolvedValue({});

      await actions.remove(
        { commit, state: { records: {}, myDraftConversationIds: [7] } },
        { key: 'draft-7-REPLY', conversationId: 7, replyType: 'REPLY' }
      );

      expect(commit).toHaveBeenCalledWith(types.REMOVE_DRAFT_MESSAGES, {
        key: 'draft-7-REPLY',
      });
      expect(commit).toHaveBeenCalledWith(
        types.SET_MY_DRAFT_CONVERSATION_IDS,
        []
      );
      expect(axios.delete).toHaveBeenCalledWith(
        expect.stringContaining('/conversations/7/draft_messages'),
        { params: { reply_type: 'reply' } }
      );
    });
  });

  describe('#fetchMine', () => {
    it('stores the conversation ids that have my drafts', async () => {
      axios.get.mockResolvedValue({
        data: [{ conversation_id: 3, updated_at: 1 }],
      });

      await actions.fetchMine({ commit });

      expect(commit.mock.calls).toEqual([
        [types.SET_MY_DRAFT_CONVERSATION_IDS, [3]],
      ]);
    });
  });
});
