module.exports = {
    plugins: [
        require('postcss-import'),
        require('tailwindcss/nesting'),
        require('tailwindcss'),
        require('autoprefixer'),
        require('cssnano')({
            // Keep the Hallmark stamp, its critique and the waivers in the served stylesheet.
            preset: ['default', { discardComments: false }],
        }),
    ]
}
