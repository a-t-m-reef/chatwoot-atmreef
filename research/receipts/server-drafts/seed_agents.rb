inbox = Inbox.find(8)
PASSWORD = 'Drafts-Test-2026!'
[['Agent A', 'agent-a@drafts.test'], ['Agent B', 'agent-b@drafts.test']].each do |name, email|
  user = User.find_or_initialize_by(email: email)
  user.update!(name: name, password: PASSWORD, password_confirmation: PASSWORD, confirmed_at: Time.current)
  AccountUser.find_or_create_by!(account: inbox.account, user: user) { |au| au.role = :agent }
  InboxMember.find_or_create_by!(inbox: inbox, user: user)
  puts "#{email} id=#{user.id}"
end
