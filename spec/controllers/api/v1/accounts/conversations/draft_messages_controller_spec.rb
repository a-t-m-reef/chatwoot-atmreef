require 'rails_helper'

RSpec.describe 'Conversation Draft Messages API', type: :request do
  let(:account) { create(:account) }
  let(:conversation) { create(:conversation, account: account) }
  let(:draft_url) { api_v1_account_conversation_draft_messages_url(account_id: account.id, conversation_id: conversation.display_id) }

  context 'when it is an unauthenticated user' do
    it 'returns unauthorized' do
      get draft_url

      expect(response).to have_http_status(:unauthorized)
    end
  end

  context 'when it is an authenticated user with access to the inbox' do
    let(:agent) { create(:user, account: account, role: :agent) }
    let(:teammate) { create(:user, account: account, role: :agent) }
    let(:message) { Faker::Lorem.paragraph }

    before do
      create(:inbox_member, inbox: conversation.inbox, user: agent)
      create(:inbox_member, inbox: conversation.inbox, user: teammate)
    end

    it 'saves the agent draft with its recipients' do
      params = { draft_message: { message: message, cc_emails: 'cc@example.com', bcc_emails: 'bcc@example.com', to_emails: 'to@example.com' } }

      patch draft_url, params: params, headers: agent.create_new_auth_token, as: :json

      expect(response).to have_http_status(:success)
      draft = conversation.drafts.find_by(user: agent, reply_type: 'reply')
      expect(draft.content).to eq(message)
      expect(draft.cc_emails).to eq('cc@example.com')
      expect(draft.bcc_emails).to eq('bcc@example.com')
      expect(draft.to_emails).to eq('to@example.com')
    end

    it 'updates the existing draft instead of creating another' do
      create(:draft, conversation: conversation, user: agent, content: 'old')

      patch draft_url, params: { draft_message: { message: message } }, headers: agent.create_new_auth_token, as: :json

      expect(conversation.drafts.where(user: agent).count).to eq(1)
      expect(conversation.drafts.find_by(user: agent).content).to eq(message)
    end

    it 'keeps reply and private note drafts apart' do
      create(:draft, conversation: conversation, user: agent, content: 'reply text')
      create(:draft, conversation: conversation, user: agent, reply_type: 'note', content: 'note text')

      get draft_url, params: { reply_type: 'note' }, headers: agent.create_new_auth_token

      expect(response.parsed_body['message']).to eq('note text')
    end

    it 'gets the agent draft' do
      create(:draft, conversation: conversation, user: agent, content: message)

      get draft_url, headers: agent.create_new_auth_token, as: :json

      expect(response).to have_http_status(:success)
      expect(response.parsed_body['has_draft']).to be(true)
      expect(response.parsed_body['message']).to eq(message)
    end

    it 'does not show a teammate draft text, only who is drafting' do
      create(:draft, conversation: conversation, user: teammate, content: message)

      get draft_url, headers: agent.create_new_auth_token, as: :json

      expect(response.parsed_body['has_draft']).to be(false)
      expect(response.body).not_to include(message)
      expect(response.parsed_body['other_drafters']).to eq([teammate.available_name])
    end

    it 'removes only the agent draft' do
      create(:draft, conversation: conversation, user: agent)
      create(:draft, conversation: conversation, user: teammate)

      delete draft_url, headers: agent.create_new_auth_token, as: :json

      expect(response).to have_http_status(:success)
      expect(conversation.drafts.pluck(:user_id)).to eq([teammate.id])
    end
  end
end
