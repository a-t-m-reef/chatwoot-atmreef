import { getters } from '../../draftMessages';
import { data } from './fixtures';

describe('#getters', () => {
  it('return the payload if key is present', () => {
    const state = {
      records: data,
    };
    expect(getters.get(state)('draft-32-REPLY')).toEqual('Hey how ');
  });

  it('return empty string if key is not present', () => {
    const state = {
      records: data,
    };
    expect(getters.get(state)('draft-22-REPLY')).toEqual('');
  });

  it('returns the message of an object draft', () => {
    const state = {
      records: { 'draft-1-REPLY': { message: 'Hi', ccEmails: 'a@b.com' } },
    };
    expect(getters.get(state)('draft-1-REPLY')).toEqual('Hi');
    expect(getters.getDraft(state)('draft-1-REPLY').ccEmails).toEqual(
      'a@b.com'
    );
  });

  it('reads a legacy string draft as an object', () => {
    const state = { records: data };
    expect(getters.getDraft(state)('draft-31-REPLY')).toEqual({
      message: 'Nice',
    });
  });

  it('tells whether I have a draft on a conversation', () => {
    const state = { myDraftConversationIds: [12] };
    expect(getters.hasMyDraft(state)('12')).toBe(true);
    expect(getters.hasMyDraft(state)(13)).toBe(false);
  });

  it('return replyEditorMode', () => {
    const state = {
      replyEditorMode: 'reply',
    };
    expect(getters.getReplyEditorMode(state)).toEqual('reply');
  });
});
