class Api::V1::Accounts::Conversations::DraftMessagesController < Api::V1::Accounts::Conversations::BaseController
  # Drafts are private to each agent. Teammates only learn who else is drafting a reply, never the text.
  def show
    render json: draft_json(current_draft).merge(other_drafters: other_drafters)
  end

  def update
    draft = @conversation.drafts.find_or_initialize_by(user: Current.user, reply_type: reply_type)
    draft.update!(draft_params)
    render json: draft_json(draft)
  rescue ActiveRecord::RecordNotUnique
    # Two tabs created the same draft at once; the retry finds the row the other one inserted.
    retry
  end

  def destroy
    current_draft&.destroy!
    head :ok
  end

  private

  def current_draft
    @conversation.drafts.find_by(user: Current.user, reply_type: reply_type)
  end

  def other_drafters
    @conversation.drafts.replies.with_content.where(user: Current.account.users).where.not(user: Current.user)
                 .includes(:user).map { |draft| draft.user.available_name }
  end

  def draft_json(draft)
    return { has_draft: false } if draft.blank?

    {
      has_draft: true,
      message: draft.content,
      to_emails: draft.to_emails,
      cc_emails: draft.cc_emails,
      bcc_emails: draft.bcc_emails,
      in_reply_to: draft.in_reply_to_message_id,
      updated_at: draft.updated_at.to_i
    }
  end

  def reply_type
    params[:reply_type].presence || 'reply'
  end

  def draft_params
    permitted = params.require(:draft_message).permit(:message, :to_emails, :cc_emails, :bcc_emails, :in_reply_to)
    {
      content: permitted[:message],
      to_emails: permitted[:to_emails],
      cc_emails: permitted[:cc_emails],
      bcc_emails: permitted[:bcc_emails],
      in_reply_to_message_id: permitted[:in_reply_to]
    }
  end
end
