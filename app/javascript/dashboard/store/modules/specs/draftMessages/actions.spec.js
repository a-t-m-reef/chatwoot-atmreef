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

    it('applies a server draft newer than the local copy', async () => {
      axios.get.mockResolvedValue({ data: serverDraft });

      const result = await actions.fetch(
        { commit },
        {
          key: 'draft-1-REPLY',
          conversationId: 1,
          replyType: 'REPLY',
          since: 100,
        }
      );

      expect(result).toBe(true);
      expect(axios.get).toHaveBeenCalledWith(
        expect.stringContaining('/conversations/1/draft_messages'),
        { params: { reply_type: 'reply' } }
      );
      expect(commit.mock.calls).toEqual([
        [types.SET_OTHER_DRAFTERS, { conversationId: 1, names: ['Kim'] }],
        [
          types.SET_DRAFT_MESSAGES,
          {
            key: 'draft-1-REPLY',
            message: 'From laptop',
            toEmails: 'to@b.com',
            ccEmails: 'cc@b.com',
            bccEmails: '',
            inReplyTo: 9,
            updatedAt: 200,
          },
        ],
      ]);
    });

    it('keeps the local copy when it is newer', async () => {
      axios.get.mockResolvedValue({ data: serverDraft });

      const result = await actions.fetch(
        { commit },
        {
          key: 'draft-2-REPLY',
          conversationId: 2,
          replyType: 'REPLY',
          since: 300,
        }
      );

      expect(result).toBe(false);
      expect(commit.mock.calls.map(([type]) => type)).toEqual([
        types.SET_OTHER_DRAFTERS,
      ]);
    });
  });

  describe('#sync', () => {
    const state = {
      records: { 'draft-5-REPLY': { message: 'Hello', ccEmails: 'c@d.com' } },
      myDraftConversationIds: [],
    };

    it('saves a non-empty draft and marks the conversation', async () => {
      axios.patch.mockResolvedValue({});
      const params = {
        key: 'draft-5-REPLY',
        conversationId: 5,
        replyType: 'REPLY',
        isEmpty: false,
      };

      await actions.sync({ commit, state }, params);

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
      expect(commit).toHaveBeenCalledWith(types.SET_MY_DRAFT_CONVERSATION_IDS, [
        5,
      ]);

      // An unchanged draft is not sent again.
      await actions.sync({ commit, state }, params);
      expect(axios.patch).toHaveBeenCalledTimes(1);
    });

    it('deletes the server copy of an empty draft', async () => {
      axios.delete.mockResolvedValue({});

      await actions.sync(
        { commit, state: { records: {}, myDraftConversationIds: [6] } },
        {
          key: 'draft-6-REPLY',
          conversationId: 6,
          replyType: 'REPLY',
          isEmpty: true,
        }
      );

      expect(axios.delete).toHaveBeenCalledWith(
        expect.stringContaining('/conversations/6/draft_messages'),
        { params: { reply_type: 'reply' } }
      );
      expect(commit).toHaveBeenCalledWith(
        types.SET_MY_DRAFT_CONVERSATION_IDS,
        []
      );
    });
  });

  describe('#remove', () => {
    it('removes the local draft and syncs the deletion', async () => {
      const dispatch = vi.fn();
      const params = {
        key: 'draft-7-NOTE',
        conversationId: 7,
        replyType: 'NOTE',
      };

      await actions.remove({ commit, dispatch }, params);

      expect(commit).toHaveBeenCalledWith(types.REMOVE_DRAFT_MESSAGES, {
        key: 'draft-7-NOTE',
      });
      expect(dispatch).toHaveBeenCalledWith('sync', {
        ...params,
        isEmpty: true,
      });
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
