import * as Device from 'expo-device';
import {
  cacheDirectory,
  deleteAsync,
  documentDirectory,
  getInfoAsync,
} from 'expo-file-system/legacy';
import type { ResourceSource } from 'react-native-executorch';
import {
  models,
  MULTI_QA_MINILM_L6_COS_V1,
  ResourceFetcherUtils,
} from 'react-native-executorch';
import { ExpoResourceFetcher } from 'react-native-executorch-expo-resource-fetcher';

export const modelDownloadedKey = 'offline_ai_model_downloaded';
export const modelDownloadInProgressKey = 'offline_ai_model_download_in_progress';
export const modelProfileKey = 'offline_ai_model_profile';
export const searchModelDownloadedKey = 'offline_ai_search_model_downloaded';
export const searchModelDownloadInProgressKey = 'offline_ai_search_model_download_in_progress';
export const searchModelProfileKey = 'offline_ai_search_model_profile';
const embeddingResourceName = 'distiluse-base-multilingual-cased-v2-8da4w';
export const embeddingModelName = `${embeddingResourceName}-chunk100-noprefix-v2`;

const remoteOfflineLlmModel = models.llm.qwen2_5_3b({ quant: true });
const remoteOfflineEmbeddingModel =
  models.text_embedding.distiluse_base_multilingual_cased_v2();
export const offlineLlmModel = toLocalRuntimeModel(remoteOfflineLlmModel);
export const offlineEmbeddingModel = toLocalRuntimeModel(remoteOfflineEmbeddingModel);
export const offlineSearchModelProfile = embeddingResourceName;
export const offlineModelProfile = `${offlineLlmModel.modelName}+${embeddingResourceName}`;
export const minimumRecommendedMemoryBytes = 4 * 1024 ** 3;

export type OfflineModelResource = {
  label: string;
  source: ResourceSource;
};

export const offlineSearchModelResources: OfflineModelResource[] = [
  { label: 'lesson search files', source: remoteOfflineEmbeddingModel.modelSource },
  { label: 'lesson search vocabulary', source: remoteOfflineEmbeddingModel.tokenizerSource },
];

export const offlineAnswerModelResources: OfflineModelResource[] = [
  { label: 'study helper files', source: remoteOfflineLlmModel.modelSource },
  { label: 'study helper vocabulary', source: remoteOfflineLlmModel.tokenizerSource },
  { label: 'study helper settings', source: remoteOfflineLlmModel.tokenizerConfigSource },
];

export const offlineModelResources: OfflineModelResource[] = [
  ...offlineSearchModelResources,
  ...offlineAnswerModelResources,
];

export function formatEmbeddingInput(
  text: string,
  _kind: 'query' | 'passage'
) {
  return text.replace(/\s+/g, ' ').trim();
}

const previousAlabLlmModels = [
  models.llm.qwen2_5_0_5b({ quant: true }),
  models.llm.qwen2_5_1_5b({ quant: true }),
  models.llm.qwen2_5_3b({ quant: true }),
];

const previousAlabEmbeddingModels = [
  MULTI_QA_MINILM_L6_COS_V1,
];

const allAlabModelSources = [
  ...previousAlabEmbeddingModels.flatMap((model) => [
    model.modelSource,
    model.tokenizerSource,
  ]),
  remoteOfflineEmbeddingModel.modelSource,
  remoteOfflineEmbeddingModel.tokenizerSource,
  ...previousAlabLlmModels.flatMap((model) => [
    model.modelSource,
    model.tokenizerSource,
    model.tokenizerConfigSource,
  ]),
];

const allAlabSearchModelSources = [
  ...previousAlabEmbeddingModels.flatMap((model) => [
    model.modelSource,
    model.tokenizerSource,
  ]),
  remoteOfflineEmbeddingModel.modelSource,
  remoteOfflineEmbeddingModel.tokenizerSource,
];

const allAlabAnswerModelSources = [
  ...previousAlabLlmModels.flatMap((model) => [
    model.modelSource,
    model.tokenizerSource,
    model.tokenizerConfigSource,
  ]),
];

export function getOfflineModelDeviceWarning() {
  const architectures = Device.supportedCpuArchitectures ?? [];
  const hasArm64 = architectures.some((architecture) =>
    architecture.toLowerCase().includes('arm64')
  );

  if (architectures.length > 0 && !hasArm64) {
    return 'This study helper needs a 64-bit Android device.';
  }

  if (
    Device.totalMemory &&
    Device.totalMemory < minimumRecommendedMemoryBytes
  ) {
    return 'This device or emulator may not have enough RAM for the study helper. Use an Android device or emulator with at least 4 GB RAM';
  }

  return null;
}

export async function deleteOfflineModelResources() {
  await deleteModelResources(allAlabModelSources);
}

export async function deleteOfflineSearchModelResources() {
  await deleteModelResources(allAlabSearchModelSources);
}

export async function deleteOfflineAnswerModelResources() {
  await deleteModelResources(allAlabAnswerModelSources);
}

async function deleteModelResources(sources: ResourceSource[]) {
  try {
    await ExpoResourceFetcher.deleteResources(...sources);
  } catch {
    // A missing or locked model file should not block the recovery flow.
  }

  await Promise.all(sources.map(deleteCacheResource));
}

export async function cancelOfflineModelDownloads() {
  await cancelModelDownloads(allAlabModelSources);
}

export async function cancelOfflineSearchModelDownloads() {
  await cancelModelDownloads(allAlabSearchModelSources);
}

export async function cancelOfflineAnswerModelDownloads() {
  await cancelModelDownloads(allAlabAnswerModelSources);
}

async function cancelModelDownloads(sources: ResourceSource[]) {
  await Promise.all(
    sources.map(async (source) => {
      try {
        await ExpoResourceFetcher.cancelFetching(source);
      } catch {
        // The source may not be actively downloading; continue recovery.
      }
    })
  );
}

export async function downloadOfflineSearchModelResources(
  onProgress: (status: {
    label: string;
    overallProgress: number;
    resourceIndex: number;
    resourceProgress: number;
    totalResources: number;
  }) => void
) {
  await downloadResources(offlineSearchModelResources, onProgress);
}

export async function downloadOfflineAnswerModelResources(
  onProgress: (status: {
    label: string;
    overallProgress: number;
    resourceIndex: number;
    resourceProgress: number;
    totalResources: number;
  }) => void
) {
  await downloadResources(offlineAnswerModelResources, onProgress);
}

export async function downloadOfflineModelResources(
  onProgress: (status: {
    label: string;
    overallProgress: number;
    resourceIndex: number;
    resourceProgress: number;
    totalResources: number;
  }) => void
) {
  await downloadResources(offlineModelResources, onProgress);
}

function toLocalRuntimeModel<T extends Record<string, unknown>>(model: T): T {
  return {
    ...model,
    modelSource: toLocalRuntimeSource(model.modelSource),
    tokenizerSource: toLocalRuntimeSource(model.tokenizerSource),
    tokenizerConfigSource: toLocalRuntimeSource(model.tokenizerConfigSource),
  };
}

function toLocalRuntimeSource(source: unknown) {
  if (typeof source !== 'string' || !documentDirectory) {
    return source;
  }

  const filename = ResourceFetcherUtils.getFilenameFromUri(source);

  return `${documentDirectory}react-native-executorch/${filename}`;
}

async function downloadResources(
  resources: OfflineModelResource[],
  onProgress: (status: {
    label: string;
    overallProgress: number;
    resourceIndex: number;
    resourceProgress: number;
    totalResources: number;
  }) => void
) {
  const totalResources = resources.length;

  for (const [index, resource] of resources.entries()) {
    const resourceIndex = index + 1;

    onProgress({
      label: resource.label,
      overallProgress: index / totalResources,
      resourceIndex,
      resourceProgress: 0,
      totalResources,
    });

    await ExpoResourceFetcher.fetch((resourceProgress) => {
      onProgress({
        label: resource.label,
        overallProgress: (index + resourceProgress) / totalResources,
        resourceIndex,
        resourceProgress,
        totalResources,
      });
    }, resource.source);

    onProgress({
      label: resource.label,
      overallProgress: resourceIndex / totalResources,
      resourceIndex,
      resourceProgress: 1,
      totalResources,
    });
  }
}

async function deleteCacheResource(source: string | number | object) {
  if (typeof source !== 'string' || !cacheDirectory) {
    return;
  }

  const filename = ResourceFetcherUtils.getFilenameFromUri(source);
  const cacheUri = `${cacheDirectory}${filename}`;

  try {
    const fileInfo = await getInfoAsync(cacheUri);

    if (fileInfo.exists) {
      await deleteAsync(cacheUri, { idempotent: true });
    }
  } catch {
    // Best-effort cleanup; the next download still starts from trusted markers.
  }
}
