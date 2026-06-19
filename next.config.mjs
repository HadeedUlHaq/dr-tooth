import { createRequire } from 'module'
import path from 'path'

const require = createRequire(import.meta.url)

// Absolute path to a file inside an installed package's directory. We resolve via
// the package's package.json (which is exported) because the browser build files
// themselves are not exposed as subpaths in the firebase "exports" map.
function pkgFile(pkg, relative) {
  return path.join(path.dirname(require.resolve(`${pkg}/package.json`)), relative)
}

let userConfig = undefined
try {
  userConfig = await import('./v0-user-next.config')
} catch (e) {
  // ignore error
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  experimental: {
    webpackBuildWorker: true,
    parallelServerBuildTraces: true,
    parallelServerCompiles: true,
  },
  webpack: (config, { isServer }) => {
    if (isServer) {
      // The Firebase client SDK's Node builds use gRPC + protobuf.js, which call
      // `new Function`/`eval` at module-eval time. The Cloudflare Workers (workerd)
      // runtime forbids runtime code generation, so SSR of any page that pulls in
      // firebase/firestore or firebase/auth crashes with
      // "EvalError: Code generation from strings disallowed". Firebase is only ever
      // used client-side here, so force the server bundle to resolve the browser
      // builds (WebChannel transport, no codegen) instead.
      config.resolve.alias = {
        ...(config.resolve.alias || {}),
        '@firebase/firestore$': pkgFile('@firebase/firestore', 'dist/index.esm2017.js'),
        '@firebase/auth$': pkgFile('@firebase/auth', 'dist/esm2017/index.js'),
      }
    }
    return config
  },
}

mergeConfig(nextConfig, userConfig)

function mergeConfig(nextConfig, userConfig) {
  if (!userConfig) {
    return
  }

  for (const key in userConfig) {
    if (
      typeof nextConfig[key] === 'object' &&
      !Array.isArray(nextConfig[key])
    ) {
      nextConfig[key] = {
        ...nextConfig[key],
        ...userConfig[key],
      }
    } else {
      nextConfig[key] = userConfig[key]
    }
  }
}

export default nextConfig
