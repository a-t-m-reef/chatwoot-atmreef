class CreateDrafts < ActiveRecord::Migration[7.1]
  def change
    create_table :drafts do |t|
      t.references :account, null: false
      t.references :conversation, null: false, index: false
      t.references :user, null: false, index: false
      t.string :reply_type, null: false, default: 'reply'
      t.text :content
      t.string :to_emails
      t.string :cc_emails
      t.string :bcc_emails
      t.bigint :in_reply_to_message_id
      t.timestamps
    end

    add_index :drafts, [:conversation_id, :user_id, :reply_type], unique: true
    add_index :drafts, [:user_id, :account_id]
  end
end
