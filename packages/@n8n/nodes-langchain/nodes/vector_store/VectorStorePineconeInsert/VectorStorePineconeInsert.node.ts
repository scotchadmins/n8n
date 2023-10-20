import {
	type IExecuteFunctions,
	type INodeType,
	type INodeTypeDescription,
	type INodeExecutionData,
	NodeConnectionType,
} from 'n8n-workflow';
import { PineconeStore } from 'langchain/vectorstores/pinecone';
import { PineconeClient } from '@pinecone-database/pinecone';
import type { Embeddings } from 'langchain/embeddings/base';
import type { Document } from 'langchain/document';
import type { N8nJsonLoader } from '../../../utils/N8nJsonLoader';
import { processDocuments } from '../shared/processDocuments';

export class VectorStorePineconeInsert implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Pinecone: Insert',
		name: 'vectorStorePineconeInsert',
		icon: 'file:pinecone.svg',
		group: ['transform'],
		version: 1,
		description: 'Insert data into Pinecone Vector Store index',
		defaults: {
			name: 'Pinecone: Insert',
			// eslint-disable-next-line n8n-nodes-base/node-class-description-non-core-color-present
			color: '#1321A7',
		},
		codex: {
			categories: ['AI'],
			subcategories: {
				AI: ['Vector Stores'],
			},
			resources: {
				primaryDocumentation: [
					{
						url: 'https://docs.n8n.io/integrations/builtin/cluster-nodes/sub-nodes/n8n-nodes-langchain.vectorstorepineconeinsert/',
					},
				],
			},
		},
		credentials: [
			{
				name: 'pineconeApi',
				required: true,
			},
		],
		inputs: [
			NodeConnectionType.Main,
			{
				displayName: 'Document',
				maxConnections: 1,
				type: NodeConnectionType.AiDocument,
				required: true,
			},
			{
				displayName: 'Embedding',
				maxConnections: 1,
				type: NodeConnectionType.AiEmbedding,
				required: true,
			},
		],
		outputs: [NodeConnectionType.Main],
		properties: [
			{
				displayName: 'Pinecone Index',
				name: 'pineconeIndex',
				type: 'string',
				default: '',
				required: true,
			},
			{
				displayName: 'Pinecone Namespace',
				name: 'pineconeNamespace',
				type: 'string',
				default: '',
			},
			{
				displayName: 'Specify the document to load in the document loader sub-node',
				name: 'notice',
				type: 'notice',
				default: '',
			},
			{
				displayName: 'Clear Namespace',
				name: 'clearNamespace',
				type: 'boolean',
				default: false,
				description: 'Whether to clear the namespace before inserting new data',
			},
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData(0);
		this.logger.verbose('Executing data for Pinecone Insert Vector Store');

		const namespace = this.getNodeParameter('pineconeNamespace', 0) as string;
		const index = this.getNodeParameter('pineconeIndex', 0) as string;
		const clearNamespace = this.getNodeParameter('clearNamespace', 0) as boolean;

		const credentials = await this.getCredentials('pineconeApi');

		const documentInput = (await this.getInputConnectionData(NodeConnectionType.AiDocument, 0)) as
			| N8nJsonLoader
			| Array<Document<Record<string, unknown>>>;

		const embeddings = (await this.getInputConnectionData(
			NodeConnectionType.AiEmbedding,
			0,
		)) as Embeddings;

		const client = new PineconeClient();
		await client.init({
			apiKey: credentials.apiKey as string,
			environment: credentials.environment as string,
		});

		const pineconeIndex = client.Index(index);

		if (namespace && clearNamespace) {
			await pineconeIndex.delete1({ deleteAll: true, namespace });
		}

		const { processedDocuments, serializedDocuments } = await processDocuments(
			documentInput,
			items,
		);

		await PineconeStore.fromDocuments(processedDocuments, embeddings, {
			namespace: namespace || undefined,
			pineconeIndex,
		});

		return this.prepareOutputData(serializedDocuments);
	}
}