# == Schema Information
#
# Table name: drafts
#
#  id                     :bigint           not null, primary key
#  bcc_emails             :string
#  cc_emails              :string
#  content                :text
#  reply_type             :string           default("reply"), not null
#  to_emails              :string
#  created_at             :datetime         not null
#  updated_at             :datetime         not null
#  account_id             :bigint           not null
#  conversation_id        :bigint           not null
#  in_reply_to_message_id :bigint
#  user_id                :bigint           not null
#
# Indexes
#
#  index_drafts_on_account_id                                  (account_id)
#  index_drafts_on_conversation_id_and_user_id_and_reply_type  (conversation_id,user_id,reply_type) UNIQUE
#  index_drafts_on_user_id_and_account_id                      (user_id,account_id)
#
class Draft < ApplicationRecord
  REPLY_TYPES = %w[reply note].freeze

  belongs_to :account
  belongs_to :conversation
  belongs_to :user

  before_validation :ensure_account_id
  validates :reply_type, inclusion: { in: REPLY_TYPES }
  validates :user, uniqueness: { scope: [:conversation, :reply_type] }

  scope :replies, -> { where(reply_type: 'reply') }
  scope :with_content, -> { where.not(content: [nil, '']) }

  private

  def ensure_account_id
    self.account_id = conversation&.account_id
  end
end
