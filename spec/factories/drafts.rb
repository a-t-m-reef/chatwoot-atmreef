FactoryBot.define do
  factory :draft do
    conversation
    user
    reply_type { 'reply' }
    content { Faker::Lorem.paragraph }
  end
end
