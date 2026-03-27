import {
    useState,
    useEffect
} from 'react'

const WORDPRESS_URL =
    import.meta.env.VITE_WORDPRESS_URL || 'https://rocomadrid.com'

// Check for credentials in .env file
const ENV_AUTH =
    import.meta.env.VITE_WORDPRESS_AUTH

/**
 * Hook for WordPress authentication using Application Passwords
 */
export function useWordPressAuth() {
    const [auth, setAuth] = useState(() => {
        // First check if credentials are in .env
        if (ENV_AUTH) {
            const [username, password] = ENV_AUTH.split(':')
            const encoded = btoa(`${username}:${password}`)
            const authData = {
                username,
                password,
                encoded,
                fromEnv: true
            }
            // Save to localStorage for persistence
            localStorage.setItem('wordpress_auth', JSON.stringify(authData))
            return authData
        }

        // Fall back to localStorage
        const saved = localStorage.getItem('wordpress_auth')
        return saved ? JSON.parse(saved) : null
    })
    const [isAuthenticated, setIsAuthenticated] = useState(false)
    const [isValidating, setIsValidating] = useState(false)

    // Check if auth is valid on mount
    useEffect(() => {
        if (auth) {
            validateAuth()
        }
    }, [])

    const validateAuth = async () => {
        if (!auth) return false

        setIsValidating(true)
        try {
            // Test authentication by making a simple API call
            const response = await fetch(`${WORDPRESS_URL}/wp-json/wp/v2/users/me`, {
                headers: {
                    'Authorization': `Basic ${auth.encoded}`
                }
            })

            if (response.ok) {
                setIsAuthenticated(true)
                return true
            } else {
                // Auth failed, clear stored credentials
                logout()
                return false
            }
        } catch (error) {
            console.error('Auth validation failed:', error)
            logout()
            return false
        } finally {
            setIsValidating(false)
        }
    }

    const login = async (username, password) => {
        // WordPress Application Password is just the password
        // Username is the WordPress username
        const encoded = btoa(`${username}:${password}`)
        const authData = {
            username,
            password,
            encoded
        }

        // Test the credentials
        try {
            const response = await fetch(`${WORDPRESS_URL}/wp-json/wp/v2/users/me`, {
                headers: {
                    'Authorization': `Basic ${encoded}`
                }
            })

            if (!response.ok) {
                throw new Error('Invalid credentials')
            }

            localStorage.setItem('wordpress_auth', JSON.stringify(authData))
            setAuth(authData)
            setIsAuthenticated(true)
            return {
                success: true
            }
        } catch (error) {
            return {
                success: false,
                error: error.message || 'Authentication failed'
            }
        }
    }

    const logout = () => {
        localStorage.removeItem('wordpress_auth')
        setAuth(null)
        setIsAuthenticated(false)
    }

    const getAuthHeader = () => {
        if (!auth) return {}
        return {
            'Authorization': `Basic ${auth.encoded}`
        }
    }

    return {
        auth,
        isAuthenticated,
        isValidating,
        login,
        logout,
        getAuthHeader,
        validateAuth
    }
}