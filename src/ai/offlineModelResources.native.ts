import * as Device from 'expo-device';
import {
  cacheDirectory,
  deleteAsync,
  getInfoAsync,
} from 'expo-file-system/legacy';
import {
  models,
  MULTI_QA_MINILM_L6_COS_V1,
  ResourceFetcherUtils,
} from 'react-native-executorch';
import type { TextEmbeddingsProps } from 'react-native-executorch';
import { ExpoResourceFetcher } from 'react-native-executorch-expo-resource-fetcher';

export const modelDownloadedKey = 'offline_ai_model_downloaded';
export const modelDownloadInProgressKey = 'offline_ai_model_download_in_progress';
export const modelProfileKey = 'offline_ai_model_profile';
export const embeddingModelName = 'multilingual-e5-small';

export const offlineLlmModel = models.llm.qwen2_5_3b({ quant: true });
export const offlineEmbeddingModel = {
  modelName: embeddingModelName,
  modelSource:
    'https://huggingface.co/software-mansion/react-native-executorch-multilingual-e5-small/resolve/v0.9.0/xnnpack/multilingual_e5_small_xnnpack_fp32.pte',
  tokenizerSource:
    'https://huggingface.co/intfloat/multilingual-e5-small/resolve/main/tokenizer.json',
} as unknown as TextEmbeddingsProps['model'];
export const offlineModelProfile = `${offlineLlmModel.modelName}+${embeddingModelName}`;
export const minimumRecommendedMemoryBytes = 6 * 1024 ** 3;

const embeddingQueryPrefix = 'query: ';
const embeddingPassagePrefix = 'passage: ';

export function formatEmbeddingInput(
  text: string,
  kind: 'query' | 'passage'
) {
  const cleanText = text.replace(/\s+/g, ' ').trim();
  const prefix = kind === 'query' ? embeddingQueryPrefix : embeddingPassagePrefix;

  if (!cleanText) {
    return prefix.trim();
  }

  if (
    cleanText.startsWith(embeddingQueryPrefix) ||
    cleanText.startsWith(embeddingPassagePrefix)
  ) {
    return cleanText;
  }

  return `${prefix}${cleanText}`;
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
  ...previousAlabLlmModels.flatMap((model) => [
    model.modelSource,
    model.tokenizerSource,
    model.tokenizerConfigSource,
  ]),
  ...previousAlabEmbeddingModels.flatMap((model) => [
    model.modelSource,
    model.tokenizerSource,
  ]),
  offlineEmbeddingModel.modelSource,
  offlineEmbeddingModel.tokenizerSource,
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
    return 'This device or emulator may not have enough RAM for the larger study helper. Use an Android device or emulator with at least 6 GB RAM';
  }

  return null;
}

export async function deleteOfflineModelResources() {
  try {
    await ExpoResourceFetcher.deleteResources(...allAlabModelSources);
  } catch {
    // A missing or locked model file should not block the recovery flow.
  }

  await Promise.all(allAlabModelSources.map(deleteCacheResource));
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
