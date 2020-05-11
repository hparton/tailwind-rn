'use strict';
const path = require('path');
const fs = require('fs');
const css = require('css');
const process = require('process');
const postcss = require('postcss');
const tailwind = require('tailwindcss');
const CleanCSS = require('clean-css');
const cssToReactNative = require('css-to-react-native').default;
const pkgJson = require('tailwindcss/package.json');
const yargs = require('yargs');
const watch = require('node-watch');

const compileTailwind = (filename = 'tailwind', config) => {
	return new Promise((resolve, reject) => {
		console.log(`Processing ./${filename}.css...`);

		const css = fs.readFileSync(
			path.resolve(__dirname, `./${filename}.css`),
			'utf8'
		);

		return postcss([tailwind(config), require('autoprefixer')])
			.process(css, {
				from: path.resolve(__dirname, `./${filename}.css`),
				to: path.resolve(__dirname, `./dist/${filename}.css`),
				map: {inline: false}
			})
			.then(result => {
				resolve(result);
			})
			.catch(error => {
				console.log(error);
				reject();
			});
	});
};

const remToPx = value => `${parseFloat(value) * 16}px`;

const getStyles = rule => {
	const styles = rule.declarations
		.filter(({property, value}) => {
			// skip usage of vars I don't think they do anything
			if (value.includes('var(')) {
				return false;
			}

			// remove var properties
			if (property.includes('--')) {
				return false;
			}

			// Skip line-height utilities without units
			if (property === 'line-height') {
				return false;
			}

			return true;
		})
		.map(({property, value}) => {
			if (value.endsWith('rem')) {
				return [property, remToPx(value)];
			}

			return [property, value];
		});

	return cssToReactNative(styles);
};

const supportedUtilities = [
	// Flexbox
	/^flex/,
	/^items-/,
	/^content-/,
	/^justify-/,
	/^self-/,
	// Display
	'hidden',
	'overflow-hidden',
	'overflow-visible',
	'overflow-scroll',
	// Position
	'absolute',
	'relative',
	// Top, right, bottom, left
	/^(inset-0|inset-x-0|inset-y-0)/,
	/^(top|bottom|left|right)-0$/,
	// Z Index
	/^z-\d+$/,
	// Padding
	/^(p.?-\d+|p.?-px)/,
	// Margin
	/^-?(m.?-\d+|m.?-px)/,
	// Width
	/^w-(\d|\/)+|^w-px|^w-full/,
	// Height
	/^(h-\d+|h-px|h-full)/,
	// Min/Max width/height
	/^(min-w-|max-w-|min-h-0|min-h-full|max-h-full)/,
	// Font size
	/^text-/,
	// Font style
	/^(not-)?italic$/,
	// Font weight
	/^font-(hairline|thin|light|normal|medium|semibold|bold|extrabold|black)/,
	// Letter spacing
	/^tracking-/,
	// Line height
	/^leading-/,
	// Text align, color
	/^text-/,
	// Text transform
	'uppercase',
	'lowercase',
	'capitalize',
	'normal-case',
	// Background color
	/^bg-(transparent|black|white|gray|red|orange|yellow|green|teal|blue|indigo|purple|pink)/,
	// Border color, style, width, radius
	/^border-(?!current)/,
	/^rounded/,
	// Opacity
	/^opacity-/,
	// Pointer events
	/^pointer-events-/
];

const isUtilitySupported = utility => {
	for (const supportedUtility of supportedUtilities) {
		if (typeof supportedUtility === 'string' && supportedUtility === utility) {
			return true;
		}

		if (supportedUtility instanceof RegExp && supportedUtility.test(utility)) {
			return true;
		}
	}

	return false;
};

const mapClassNames = stylesheet => {
	// Mapping of Tailwind class names to React Native styles
	const styles = {};

	for (const rule of stylesheet.rules) {
		if (rule.type === 'rule') {
			for (const selector of rule.selectors) {
				const utility = selector.replace(/^\./, '').replace('\\/', '/');

				if (isUtilitySupported(utility)) {
					styles[utility] = getStyles(rule);
				}
			}
		}
	}

	// Additional styles that we're not able to parse correctly automatically
	styles.underline = {textDecorationLine: 'underline'};
	styles['line-through'] = {textDecorationLine: 'line-through'};
	styles['no-underline'] = {textDecorationLine: 'none'};

	fs.writeFileSync(
		path.join(__dirname, 'styles.json'),
		JSON.stringify(styles, null, '\t')
	);
};

const pkgPath = require.resolve('tailwindcss').replace(pkgJson.main, '');
const customConfig = path.resolve(process.cwd(), yargs.argv.config);

if (fs.existsSync(customConfig)) {
	if (yargs.argv.watch) {
		watch(customConfig, {recursive: true}, function(evt, name) {
			console.log('%s changed.', name);
			compileTailwind('tailwind', customConfig).then(result => {
				const {stylesheet} = css.parse(result.css);
				mapClassNames(stylesheet);
			});
		});
	}

	compileTailwind('tailwind', customConfig).then(result => {
		const {stylesheet} = css.parse(result.css);
		mapClassNames(stylesheet);
	});
} else {
	const source = fs.readFileSync(path.join(pkgPath, pkgJson.style), 'utf8');
	const {stylesheet} = css.parse(source);
	mapClassNames(stylesheet);
}

return;
