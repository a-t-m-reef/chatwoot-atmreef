class Api::V1::Accounts::DraftsController < Api::V1::Accounts::BaseController
  # The current agent's non-empty reply drafts in this account, used to mark conversation cards.
  def index
    drafts = Current.user.drafts.replies.with_content.where(account: Current.account).joins(:conversation)
    render json: drafts.pluck('conversations.display_id', 'drafts.updated_at').map { |display_id, updated_at|
      { conversation_id: display_id, updated_at: updated_at.to_i }
    }
  end
end
