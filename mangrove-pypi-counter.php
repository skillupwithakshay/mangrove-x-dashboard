<?php
/**
 * Mangrove PyPI download counter for WordPress.
 *
 * WHERE THIS GOES (pick one):
 *   - Your theme's functions.php (use a child theme so updates don't wipe it), OR
 *   - A new snippet in the free "Code Snippets" plugin (recommended, safer).
 *
 * WHY PHP: pypistats.org sends no CORS headers, so a browser on your site cannot
 * call it directly. WordPress runs server-side, so it can. No Cloudflare or any
 * external service needed; your own WordPress server does the work.
 *
 * It sums the NON-MIRROR downloads for the three packages and caches the result
 * for 2 hours (a WordPress transient), so pypistats is queried at most once every
 * 2 hours no matter how much traffic the page gets.
 *
 * After adding this, you get BOTH:
 *   1. Shortcode  [mangrove_pypi_downloads]   -> prints the number (no JS needed)
 *   2. REST route /wp-json/mangrove/v1/pypi-downloads -> JSON for the HTML embed
 */

if ( ! defined( 'ABSPATH' ) ) { exit; }

function mangrove_pypi_packages() {
	return array( 'mangrovemarkets', 'mangroveai', 'mangrove-kb' );
}

/**
 * Returns array( 'total' => int, 'packages' => array(name => int), 'updated' => str ).
 * Cached for 2 hours.
 */
function mangrove_pypi_fetch_total() {
	$cached = get_transient( 'mangrove_pypi_total' );
	if ( false !== $cached ) {
		return $cached;
	}

	$result = array( 'total' => 0, 'packages' => array(), 'updated' => gmdate( 'c' ) );

	foreach ( mangrove_pypi_packages() as $pkg ) {
		$url = 'https://pypistats.org/api/packages/' . rawurlencode( $pkg ) . '/overall?mirrors=false';
		$res = wp_remote_get( $url, array(
			'timeout' => 15,
			'headers' => array( 'Accept' => 'application/json' ),
		) );

		$pkg_total = 0;
		if ( ! is_wp_error( $res ) && 200 === (int) wp_remote_retrieve_response_code( $res ) ) {
			$body = json_decode( wp_remote_retrieve_body( $res ), true );
			if ( isset( $body['data'] ) && is_array( $body['data'] ) ) {
				foreach ( $body['data'] as $row ) {
					// Guard so mirror rows are never counted.
					if ( isset( $row['category'], $row['downloads'] ) && 'without_mirrors' === $row['category'] ) {
						$pkg_total += (int) $row['downloads'];
					}
				}
			}
		}

		$result['packages'][ $pkg ] = $pkg_total;
		$result['total'] += $pkg_total;
	}

	// If every package failed (total 0), cache only briefly so we retry soon.
	$ttl = ( $result['total'] > 0 ) ? ( 2 * HOUR_IN_SECONDS ) : ( 10 * MINUTE_IN_SECONDS );
	set_transient( 'mangrove_pypi_total', $result, $ttl );

	return $result;
}

/* 1. Shortcode: [mangrove_pypi_downloads] */
add_shortcode( 'mangrove_pypi_downloads', function () {
	$data = mangrove_pypi_fetch_total();
	return '<span id="pypi-download-count">' . esc_html( number_format_i18n( (int) $data['total'] ) ) . '</span>';
} );

/* 2. REST endpoint: /wp-json/mangrove/v1/pypi-downloads */
add_action( 'rest_api_init', function () {
	register_rest_route( 'mangrove/v1', '/pypi-downloads', array(
		'methods'             => 'GET',
		'permission_callback' => '__return_true',
		'callback'            => function () {
			return rest_ensure_response( mangrove_pypi_fetch_total() );
		},
	) );
} );
