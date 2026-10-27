import ApiClient from './ApiClient';

class DraftsAPI extends ApiClient {
  constructor() {
    super('drafts', { accountScoped: true });
  }
}

export default new DraftsAPI();
