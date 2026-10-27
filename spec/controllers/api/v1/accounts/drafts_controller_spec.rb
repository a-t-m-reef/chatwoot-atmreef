require 'rails_helper'

RSpec.describe 'Drafts API', type: :request do
  let(:account) { create(:account) }
  let(:agent) { create(:user, account: account, role: :agent) }
  let(:teammate) { create(:user, account: account, role: :agent) }
  let(:conversation) { create(:conversation, account: account) }

  describe 'GET /api/v1/accounts/{account.id}/drafts' do
    it 'returns unauthorized for an unauthenticated user' do
      get api_v1_account_drafts_url(account_id: account.id)

      expect(response).to have_http_status(:unauthorized)
    end

    it 'lists only the agent non-empty reply drafts' do
      create(:draft, conversation: conversation, user: agent)
      create(:draft, conversation: create(:conversation, account: account), user: agent, content: '')
      create(:draft, conversation: create(:conversation, account: account), user: agent, reply_type: 'note')
      create(:draft, conversation: create(:conversation, account: account), user: teammate)

      get api_v1_account_drafts_url(account_id: account.id), headers: agent.create_new_auth_token, as: :json

      expect(response).to have_http_status(:success)
      expect(response.parsed_body.pluck('conversation_id')).to eq([conversation.display_id])
    end
  end
end
