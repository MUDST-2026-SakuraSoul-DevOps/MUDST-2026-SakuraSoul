import { act, renderHook, waitFor } from '@testing-library/react'
import { useEffect } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../api/client'
import { useLoader } from './useLoader'

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('useLoader', () => {
  it('starts in a loading state and exposes loaded data after success', async () => {
    const request = deferred<string[]>()
    const load = vi.fn(() => request.promise)
    const { result } = renderHook(() => useLoader(load, 'Could not load records'))

    expect(result.current).toMatchObject({ data: null, error: null, loading: true })
    expect(load).toHaveBeenCalledTimes(1)

    await act(async () => {
      request.resolve(['first', 'second'])
      await request.promise
    })

    await waitFor(() => {
      expect(result.current).toMatchObject({
        data: ['first', 'second'],
        error: null,
        loading: false,
      })
    })
  })

  it('exposes the API error message and finishes loading after failure', async () => {
    const request = deferred<string[]>()
    const load = vi.fn(() => request.promise)
    const { result } = renderHook(() => useLoader(load, 'Could not load records'))

    await act(async () => {
      request.reject(new ApiError(500, 'The service is unavailable'))
      try {
        await request.promise
      } catch {
        // The hook owns the rejected promise and exposes its user-facing error state.
      }
    })

    await waitFor(() => {
      expect(result.current).toMatchObject({
        data: null,
        error: 'The service is unavailable',
        loading: false,
      })
    })
  })

  it('reloads data and ignores a stale response from the previous request', async () => {
    const firstRequest = deferred<string>()
    const secondRequest = deferred<string>()
    const load = vi
      .fn<() => Promise<string>>()
      .mockReturnValueOnce(firstRequest.promise)
      .mockReturnValueOnce(secondRequest.promise)
    const { result } = renderHook(() => useLoader(load, 'Could not load records'))

    act(() => {
      result.current.reload()
    })

    await waitFor(() => {
      expect(load).toHaveBeenCalledTimes(2)
    })
    expect(result.current.loading).toBe(true)

    await act(async () => {
      secondRequest.resolve('fresh data')
      await secondRequest.promise
    })

    await waitFor(() => {
      expect(result.current).toMatchObject({ data: 'fresh data', error: null, loading: false })
    })

    await act(async () => {
      firstRequest.resolve('stale data')
      await firstRequest.promise
    })

    expect(result.current.data).toBe('fresh data')
  })

  it('does not publish state changes after unmounting', async () => {
    const request = deferred<string>()
    const load = vi.fn(() => request.promise)
    const observedStates = vi.fn()

    const { unmount } = renderHook(() => {
      const loader = useLoader(load, 'Could not load records')
      useEffect(() => {
        observedStates(loader)
      }, [loader])
      return loader
    })

    await waitFor(() => {
      expect(observedStates).toHaveBeenCalledTimes(1)
    })
    unmount()

    await act(async () => {
      request.resolve('late data')
      await request.promise
    })

    expect(observedStates).toHaveBeenCalledTimes(1)
  })
})
