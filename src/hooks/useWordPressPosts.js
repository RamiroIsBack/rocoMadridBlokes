import {
    useState,
    useEffect
} from 'react'

// WordPress REST API configuration
const WORDPRESS_URL =
    import.meta.env.VITE_WORDPRESS_URL || 'https://rocomadrid.com'

// WordPress Application Password credentials
const ENV_AUTH =
    import.meta.env.VITE_WORDPRESS_AUTH

// Get auth header for API calls
function getAuthHeader() {
    if (ENV_AUTH) {
        const [username, password] = ENV_AUTH.split(':')
        return `Basic ${btoa(`${username}:${password}`)}`
    }
    // Try to get from localStorage
    try {
        const saved = localStorage.getItem('wordpress_auth')
        if (saved) {
            const auth = JSON.parse(saved)
            return auth.encoded ? `Basic ${auth.encoded}` : null
        }
    } catch (e) {
        console.warn('Could not get auth from localStorage:', e)
    }
    return null
}

const CATEGORY_MAP = {
    // Map WordPress category IDs to your category codes
    // You'll need to update these IDs after creating categories in WordPress
    PUZLE: 1, // Replace with actual category ID
    TECNICO: 2, // Replace with actual category ID
    ENTRENAMIENTO: 3, // Replace with actual category ID
    COORDINACION: 4, // Replace with actual category ID
}

// Mock data for local testing without WordPress
const MOCK_CARDS = [{
        id: 'post-1',
        postId: 1,
        timestamp: '2024-01-15T10:00:00Z',
        images: ['https://rocomadrid.com/wp-content/uploads/2025/12/categoria-bebidas-comida.jpg'],
        description: 'Un problema clásico de entrenamiento para mejorar la técnica de pies.',
        title: 'Problema de Prueba',
        category: 'ENTRENAMIENTO',
        color: 'green',
        interactions: {
            star_1: 5,
            star_2: 3,
            star_3: 1,
            skull: 0
        },
        totalInteractions: 9
    },
    {
        id: 'post-2',
        postId: 2,
        timestamp: '2024-01-16T14:30:00Z',
        images: [
            'https://rocomadrid.com/wp-content/uploads/2025/12/categoria-bebidas-comida.jpg',
            'https://rocomadrid.com/wp-content/uploads/2025/12/categoria-ropa.jpg'
        ],
        description: 'Problema técnico de precisión.',
        title: 'El Techo',
        category: 'TECNICO',
        color: 'blue',
        interactions: {
            star_1: 2,
            star_2: 4,
            star_3: 2,
            skull: 1
        },
        totalInteractions: 9
    },
    {
        id: 'post-3',
        postId: 3,
        timestamp: '2024-01-17T09:15:00Z',
        images: [
            'https://rocomadrid.com/wp-content/uploads/2025/12/categoria-bebidas-comida.jpg',
            'https://rocomadrid.com/wp-content/uploads/2025/12/categoria-ropa.jpg',
            'https://rocomadrid.com/wp-content/uploads/2025/12/categoria-servicios.jpg'
        ],
        description: 'Puzzle de movimientos complejos.',
        title: 'El Laberinto',
        category: 'PUZLE',
        color: 'yellow',
        interactions: {
            star_1: 8,
            star_2: 6,
            star_3: 3,
            skull: 2
        },
        totalInteractions: 19
    },
    {
        id: 'post-4',
        postId: 4,
        timestamp: '2024-01-18T16:45:00Z',
        images: [],
        description: 'Coordinación y dinámica.',
        title: 'El Mono',
        category: 'COORDINACION',
        color: 'red',
        interactions: {
            star_1: 1,
            star_2: 0,
            star_3: 5,
            skull: 3
        },
        totalInteractions: 9
    }
]

/**
 * Custom hook that fetches and normalizes data from WordPress posts with ACF fields.
 * 
 * Priority:
 * 1. If VITE_USE_MOCK=true, always use mock data
 * 2. Try WordPress - if it returns posts, use them
 * 3. If WordPress returns no data or error, fall back to mock
 *
 * @returns {{ cards: Object[], loading: boolean, error: string|null }}
 */
export function useWordPressPosts() {
    const [cards, setCards] = useState([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState(null)
    const [dataSource, setDataSource] = useState('loading')

    useEffect(() => {
        async function fetchData() {
            // Check if we should force mock data (for local testing)
            const forceMock =
                import.meta.env.VITE_USE_MOCK === 'true'
            const hasCredentials = !!ENV_AUTH

            // If forcing mock mode, use mock data
            if (forceMock) {
                console.log('Using mock data (forced via VITE_USE_MOCK)')
                setCards(MOCK_CARDS)
                setDataSource('mock')
                setLoading(false)
                return
            }

            // Try to fetch from WordPress first if we have credentials
            if (hasCredentials) {
                try {
                    // Build the WordPress REST API URL
                    const categoryIds = Object.values(CATEGORY_MAP).join(',')
                    const url = `${WORDPRESS_URL}/wp-json/wp/v2/posts?` + new URLSearchParams({
                        categories: categoryIds,
                        per_page: 100,
                        _embed: '',
                        acf_format: 'standard',
                    })

                    const authHeader = getAuthHeader()
                    const fetchOptions = authHeader ? {
                        headers: {
                            'Authorization': authHeader
                        }
                    } : {}

                    const response = await fetch(url, fetchOptions)

                    if (!response.ok) {
                        const errorData = await response.json().catch(() => ({}))
                        const message = errorData && errorData.message ? errorData.message : `HTTP ${response.status}`
                        throw new Error(`Error al cargar datos de WordPress: ${message}`)
                    }

                    const posts = await response.json()

                    // If we have WordPress posts, use them
                    if (posts && posts.length > 0) {
                        // Transform WordPress posts to card format
                        const parsedCards = posts.map((post) => {
                            const acf = post.acf || {}
                            const images = []

                            // Featured image
                            if (post._embedded && post._embedded['wp:featuredmedia'] && post._embedded['wp:featuredmedia'][0] && post._embedded['wp:featuredmedia'][0].source_url) {
                                images.push(post._embedded['wp:featuredmedia'][0].source_url)
                            }

                            // ACF gallery
                            if (acf.bloke_gallery && Array.isArray(acf.bloke_gallery)) {
                                acf.bloke_gallery.forEach(img => {
                                    if (img.url && !images.includes(img.url)) {
                                        images.push(img.url)
                                    }
                                })
                            }

                            let category = 'PUZLE'
                            if (post.categories && post.categories.length > 0) {
                                const categoryId = post.categories[0]
                                const categoryName = Object.keys(CATEGORY_MAP).find(
                                    key => CATEGORY_MAP[key] === categoryId
                                )
                                if (categoryName) category = categoryName
                            }

                            const color = acf.bloke_color || 'green'
                            const interactions = acf.bloke_interactions || {
                                star_1: 0,
                                star_2: 0,
                                star_3: 0,
                                skull: 0
                            }

                            return {
                                id: `post-${post.id}`,
                                postId: post.id,
                                timestamp: post.date || '',
                                images,
                                description: (acf.bloke_description || (post.excerpt && post.excerpt.rendered) || '').slice(0, 300),
                                title: ((post.title && post.title.rendered) || 'Sin título').slice(0, 20),
                                category,
                                color,
                                interactions,
                                totalInteractions: (interactions.star_1 || 0) + (interactions.star_2 || 0) + (interactions.star_3 || 0) + (interactions.skull || 0)
                            }
                        })

                        console.log(`Using WordPress data: ${parsedCards.length} posts`)
                        setCards(parsedCards)
                        setDataSource('wordpress')
                        setError(null)
                        setLoading(false)
                        return
                    } else {
                        // No posts in WordPress - fall back to mock
                        console.log('No WordPress posts found, using mock data')
                        setCards(MOCK_CARDS)
                        setDataSource('mock')
                        setError(null)
                        setLoading(false)
                        return
                    }
                } catch (err) {
                    console.error('Error fetching WordPress posts:', err)
                    // Fall back to mock data on error
                    console.log('WordPress error, using mock data')
                    setCards(MOCK_CARDS)
                    setDataSource('mock')
                    setError(null)
                    setLoading(false)
                    return
                }
            }

            // No credentials - use mock
            console.log('No credentials configured, using mock data')
            setCards(MOCK_CARDS)
            setDataSource('mock')
            setLoading(false)
        }

        fetchData()
    }, [])

    return {
        cards,
        loading,
        error,
        dataSource
    }
}

/**
 * Record an interaction (icon click)
 * @param {number} postId - WordPress post ID
 * @param {string} type - 'star_1', 'star_2', 'star_3', or 'skull'
 * @returns {Promise<Object>}
 */
export async function recordInteraction(postId, type) {
    // Use mock mode if forcing it or no credentials
    const forceMock =
        import.meta.env.VITE_USE_MOCK === 'true'
    const hasCredentials = !!ENV_AUTH

    // In mock mode, just log the interaction
    if (forceMock || !hasCredentials) {
        console.log(`Mock: Recording interaction - post ${postId}, type: ${type}`)
        return {
            success: true,
            mock: true
        }
    }

    try {
        const authHeader = getAuthHeader()
        if (!authHeader) {
            throw new Error('No authentication configured')
        }

        // Get current post to fetch existing interactions
        const getResponse = await fetch(`${WORDPRESS_URL}/wp-json/wp/v2/posts/${postId}?acf_format=standard`, {
            headers: {
                'Authorization': authHeader
            }
        })

        if (!getResponse.ok) {
            throw new Error('Failed to get post')
        }

        const post = await getResponse.json()
        const acf = post.acf || {}
        const currentInteractions = acf.bloke_interactions || {
            star_1: 0,
            star_2: 0,
            star_3: 0,
            skull: 0
        }

        // Increment the interaction count
        const newInteractions = {
            ...currentInteractions,
            [type]: (currentInteractions[type] || 0) + 1
        }

        // Update the post via REST API
        const updateResponse = await fetch(`${WORDPRESS_URL}/wp-json/wp/v2/posts/${postId}`, {
            method: 'POST',
            headers: {
                'Authorization': authHeader,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                acf: {
                    bloke_interactions: newInteractions
                }
            })
        })

        if (!updateResponse.ok) {
            const errorData = await updateResponse.json().catch(() => ({}))
            throw new Error(errorData.message || 'Failed to update interactions')
        }

        return {
            success: true,
            mock: false,
            interactions: newInteractions
        }
    } catch (err) {
        console.error('Error recording interaction:', err)
        return {
            success: false,
            error: err.message
        }
    }
}