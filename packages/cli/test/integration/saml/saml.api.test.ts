import { Container } from 'typedi';
import type { SuperAgentTest } from 'supertest';
import type { AuthenticationMethod } from 'n8n-workflow';
import type { User } from '@db/entities/User';
import { setSamlLoginEnabled } from '@/sso/saml/samlHelpers';
import { getCurrentAuthenticationMethod, setCurrentAuthenticationMethod } from '@/sso/ssoHelpers';
import { SamlUrls } from '@/sso/saml/constants';
import { InternalHooks } from '@/InternalHooks';
import { SamlService } from '@/sso/saml/saml.service.ee';
import type { SamlUserAttributes } from '@/sso/saml/types/samlUserAttributes';

import { randomEmail, randomName, randomValidPassword } from '../shared/random';
import * as utils from '../shared/utils/';
import { sampleConfig } from './sampleMetadata';
import { createOwner, createUser } from '../shared/db/users';

let someUser: User;
let owner: User;
let authMemberAgent: SuperAgentTest;
let authOwnerAgent: SuperAgentTest;

async function enableSaml(enable: boolean) {
	await setSamlLoginEnabled(enable);
}

const testServer = utils.setupTestServer({
	endpointGroups: ['me', 'saml'],
	enabledFeatures: ['feat:saml'],
});

beforeAll(async () => {
	owner = await createOwner();
	someUser = await createUser();
	authOwnerAgent = testServer.authAgentFor(owner);
	authMemberAgent = testServer.authAgentFor(someUser);
});

describe('Instance owner', () => {
	describe('PATCH /me', () => {
		test('should succeed with valid inputs', async () => {
			await enableSaml(false);
			await authOwnerAgent
				.patch('/me')
				.send({
					email: randomEmail(),
					firstName: randomName(),
					lastName: randomName(),
					password: randomValidPassword(),
				})
				.expect(200);
		});

		test('should throw BadRequestError if email is changed when SAML is enabled', async () => {
			await enableSaml(true);
			await authOwnerAgent
				.patch('/me')
				.send({
					email: randomEmail(),
					firstName: randomName(),
					lastName: randomName(),
				})
				.expect(400, { code: 400, message: 'SAML user may not change their email' });
		});
	});

	describe('PATCH /password', () => {
		test('should throw BadRequestError if password is changed when SAML is enabled', async () => {
			await enableSaml(true);
			await authOwnerAgent
				.patch('/me/password')
				.send({
					password: randomValidPassword(),
				})
				.expect(400, {
					code: 400,
					message: 'With SAML enabled, users need to use their SAML provider to change passwords',
				});
		});
	});

	describe('POST /sso/saml/config', () => {
		test('should post saml config', async () => {
			await authOwnerAgent
				.post('/sso/saml/config')
				.send({
					...sampleConfig,
					loginEnabled: true,
				})
				.expect(200);
			expect(getCurrentAuthenticationMethod()).toBe('saml');
		});
	});

	describe('POST /sso/saml/config/toggle', () => {
		test('should toggle saml as default authentication method', async () => {
			await enableSaml(true);
			expect(getCurrentAuthenticationMethod()).toBe('saml');

			await authOwnerAgent
				.post('/sso/saml/config/toggle')
				.send({
					loginEnabled: false,
				})
				.expect(200);
			expect(getCurrentAuthenticationMethod()).toBe('email');

			await authOwnerAgent
				.post('/sso/saml/config/toggle')
				.send({
					loginEnabled: true,
				})
				.expect(200);
			expect(getCurrentAuthenticationMethod()).toBe('saml');
		});
	});

	describe('POST /sso/saml/config/toggle', () => {
		test('should fail enable saml if default authentication is not email', async () => {
			await enableSaml(true);

			await authOwnerAgent
				.post('/sso/saml/config/toggle')
				.send({
					loginEnabled: false,
				})
				.expect(200);
			expect(getCurrentAuthenticationMethod()).toBe('email');

			await setCurrentAuthenticationMethod('ldap');
			expect(getCurrentAuthenticationMethod()).toBe('ldap');

			await authOwnerAgent
				.post('/sso/saml/config/toggle')
				.send({
					loginEnabled: true,
				})
				.expect(500);

			expect(getCurrentAuthenticationMethod()).toBe('ldap');
			await setCurrentAuthenticationMethod('saml');
		});
	});
});

describe('Check endpoint permissions', () => {
	beforeEach(async () => {
		await enableSaml(true);
	});
	describe('Owner', () => {
		test(`should be able to access ${SamlUrls.metadata}`, async () => {
			await authOwnerAgent.get(`/sso/saml${SamlUrls.metadata}`).expect(200);
		});

		test(`should be able to access GET ${SamlUrls.config}`, async () => {
			await authOwnerAgent.get(`/sso/saml${SamlUrls.config}`).expect(200);
		});

		test(`should be able to access POST ${SamlUrls.config}`, async () => {
			await authOwnerAgent.post(`/sso/saml${SamlUrls.config}`).expect(200);
		});

		test(`should be able to access POST ${SamlUrls.configToggleEnabled}`, async () => {
			await authOwnerAgent.post(`/sso/saml${SamlUrls.configToggleEnabled}`).expect(400);
		});

		test(`should be able to access GET ${SamlUrls.acs}`, async () => {
			// Note that 401 here is coming from the missing SAML object,
			// not from not being able to access the endpoint, so this is expected!
			const response = await authOwnerAgent.get(`/sso/saml${SamlUrls.acs}`).expect(401);
			expect(response.text).toContain('SAML Authentication failed');
		});

		test(`should be able to access POST ${SamlUrls.acs}`, async () => {
			// Note that 401 here is coming from the missing SAML object,
			// not from not being able to access the endpoint, so this is expected!
			const response = await authOwnerAgent.post(`/sso/saml${SamlUrls.acs}`).expect(401);
			expect(response.text).toContain('SAML Authentication failed');
		});

		test(`should be able to access GET ${SamlUrls.initSSO}`, async () => {
			await authOwnerAgent.get(`/sso/saml${SamlUrls.initSSO}`).expect(200);
		});

		test(`should be able to access GET ${SamlUrls.configTest}`, async () => {
			await authOwnerAgent.get(`/sso/saml${SamlUrls.configTest}`).expect(200);
		});
	});
	describe('Authenticated Member', () => {
		test(`should be able to access ${SamlUrls.metadata}`, async () => {
			await authMemberAgent.get(`/sso/saml${SamlUrls.metadata}`).expect(200);
		});

		test(`should be able to access GET ${SamlUrls.config}`, async () => {
			await authMemberAgent.get(`/sso/saml${SamlUrls.config}`).expect(200);
		});

		test(`should NOT be able to access POST ${SamlUrls.config}`, async () => {
			await authMemberAgent.post(`/sso/saml${SamlUrls.config}`).expect(403);
		});

		test(`should NOT be able to access POST ${SamlUrls.configToggleEnabled}`, async () => {
			await authMemberAgent.post(`/sso/saml${SamlUrls.configToggleEnabled}`).expect(403);
		});

		test(`should be able to access GET ${SamlUrls.acs}`, async () => {
			// Note that 401 here is coming from the missing SAML object,
			// not from not being able to access the endpoint, so this is expected!
			const response = await authMemberAgent.get(`/sso/saml${SamlUrls.acs}`).expect(401);
			expect(response.text).toContain('SAML Authentication failed');
		});

		test(`should be able to access POST ${SamlUrls.acs}`, async () => {
			// Note that 401 here is coming from the missing SAML object,
			// not from not being able to access the endpoint, so this is expected!
			const response = await authMemberAgent.post(`/sso/saml${SamlUrls.acs}`).expect(401);
			expect(response.text).toContain('SAML Authentication failed');
		});

		test(`should be able to access GET ${SamlUrls.initSSO}`, async () => {
			await authMemberAgent.get(`/sso/saml${SamlUrls.initSSO}`).expect(200);
		});

		test(`should NOT be able to access GET ${SamlUrls.configTest}`, async () => {
			await authMemberAgent.get(`/sso/saml${SamlUrls.configTest}`).expect(403);
		});
	});
	describe('Non-Authenticated User', () => {
		test(`should be able to access ${SamlUrls.metadata}`, async () => {
			await testServer.authlessAgent.get(`/sso/saml${SamlUrls.metadata}`).expect(200);
		});

		test(`should NOT be able to access GET ${SamlUrls.config}`, async () => {
			await testServer.authlessAgent.get(`/sso/saml${SamlUrls.config}`).expect(401);
		});

		test(`should NOT be able to access POST ${SamlUrls.config}`, async () => {
			await testServer.authlessAgent.post(`/sso/saml${SamlUrls.config}`).expect(401);
		});

		test(`should NOT be able to access POST ${SamlUrls.configToggleEnabled}`, async () => {
			await testServer.authlessAgent.post(`/sso/saml${SamlUrls.configToggleEnabled}`).expect(401);
		});

		test(`should be able to access GET ${SamlUrls.acs}`, async () => {
			// Note that 401 here is coming from the missing SAML object,
			// not from not being able to access the endpoint, so this is expected!
			const response = await testServer.authlessAgent.get(`/sso/saml${SamlUrls.acs}`).expect(401);
			expect(response.text).toContain('SAML Authentication failed');
		});

		test(`should be able to access POST ${SamlUrls.acs}`, async () => {
			// Note that 401 here is coming from the missing SAML object,
			// not from not being able to access the endpoint, so this is expected!
			const response = await testServer.authlessAgent.post(`/sso/saml${SamlUrls.acs}`).expect(401);
			expect(response.text).toContain('SAML Authentication failed');
		});

		test(`should be able to access GET ${SamlUrls.initSSO}`, async () => {
			const response = await testServer.authlessAgent
				.get(`/sso/saml${SamlUrls.initSSO}`)
				.expect(200);
		});

		test(`should NOT be able to access GET ${SamlUrls.configTest}`, async () => {
			await testServer.authlessAgent.get(`/sso/saml${SamlUrls.configTest}`).expect(401);
		});
	});
});

describe('SAML login flow', () => {
	beforeEach(async () => {
		await enableSaml(true);
	});

	test('should trigger onUserLoginSuccess hook', async () => {
		const mockedHandleSamlLogin = jest.spyOn(Container.get(SamlService), 'handleSamlLogin');

		mockedHandleSamlLogin.mockImplementation(
			async (): Promise<{
				authenticatedUser: User;
				attributes: SamlUserAttributes;
				onboardingRequired: false;
			}> => {
				return {
					authenticatedUser: someUser,
					attributes: {
						email: someUser.email,
						firstName: someUser.firstName,
						lastName: someUser.lastName,
						userPrincipalName: someUser.email,
					},
					onboardingRequired: false,
				};
			},
		);

		const mockedHookOnUserLoginSuccess = jest.spyOn(
			Container.get(InternalHooks),
			'onUserLoginSuccess',
		);
		mockedHookOnUserLoginSuccess.mockImplementation(
			async (userLoginData: { user: User; authenticationMethod: AuthenticationMethod }) => {
				expect(userLoginData.authenticationMethod).toEqual('saml');
				return;
			},
		);
		const response = await authOwnerAgent.post(`/sso/saml${SamlUrls.acs}`).expect(302);
		expect(mockedHookOnUserLoginSuccess).toBeCalled();
		mockedHookOnUserLoginSuccess.mockRestore();
		mockedHandleSamlLogin.mockRestore();
	});

	test('should trigger onUserLoginFailed hook', async () => {
		const mockedHandleSamlLogin = jest.spyOn(Container.get(SamlService), 'handleSamlLogin');

		mockedHandleSamlLogin.mockImplementation(
			async (): Promise<{
				authenticatedUser: User | undefined;
				attributes: SamlUserAttributes;
				onboardingRequired: false;
			}> => {
				return {
					authenticatedUser: undefined,
					attributes: {
						email: someUser.email,
						firstName: someUser.firstName,
						lastName: someUser.lastName,
						userPrincipalName: someUser.email,
					},
					onboardingRequired: false,
				};
			},
		);

		const mockedHookOnUserLoginFailed = jest.spyOn(
			Container.get(InternalHooks),
			'onUserLoginFailed',
		);
		mockedHookOnUserLoginFailed.mockImplementation(
			async (userLoginData: {
				user: string;
				authenticationMethod: AuthenticationMethod;
				reason?: string;
			}) => {
				expect(userLoginData.authenticationMethod).toEqual('saml');
				return;
			},
		);
		const response = await authOwnerAgent.post(`/sso/saml${SamlUrls.acs}`).expect(401);
		expect(mockedHookOnUserLoginFailed).toBeCalled();
		mockedHookOnUserLoginFailed.mockRestore();
		mockedHandleSamlLogin.mockRestore();
	});
});
