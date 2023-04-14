TEMP_ENV=".temp"
TEST_F=env/.env-setup

function force_copy
{
    echo "Forcing copy from $1 -> $2"
    echo ''

    shopt -s globstar

    STARTCWD=`pwd`
    cd $1

    ISP='\n'

    for FROM in **; do
        TO=$STARTCWD/$2/$FROM
        cp -r -f $FROM $TO
        echo "Copying $FROM -> $2/$FROM" 
    done

    unset ISP

    cd $STARTCWD
}

function announce
{
    clear
    echo ',---------------------------'
    echo "| $1"
    echo '`---------------------------'
    echo ''
}

if test -f $TEST_F; then
    echo 'Project environment already set up!'
    exit 1
fi

mkdir ./$TEMP_ENV
mv env/* $TEMP_ENV/

cd ./env

announce "Installing yarn"
npm install yarn -g

announce "Cloning VM"
git clone --depth 1 https://github.com/llk/scratch-vm.git

announce "Cloning GUI"
git clone --depth 1 https://github.com/llk/scratch-gui.git

# clear
# echo "Preparing VM"
# cd scratch-vm
# yarn install
# yarn link

# clear
# echo "Preparing GUI"
# cd ../scratch-gui
# yarn link scratch-vm
# yarn install

cd ..

announce "Merging Files"

force_copy $TEMP_ENV env
rm -r $TEMP_ENV

touch ./$TEST_F

announce "Done!"